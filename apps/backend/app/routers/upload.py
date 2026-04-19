import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import User, Image, PatientInfo
from app.schemas import (
    ImageResponse,
    ImageListItem,
    PatientInfoResponse,
    DISEASE_BY_ID,
    DISEASE_LABELS,
    VALID_SEX,
)
from app.auth import get_current_user
from app.config import UPLOAD_DIR
from app.services.cv_inference import cancel_classification
from app.services.image_preprocessor import preprocess_cassette, PreprocessingError
from app.services.warnings import compute_warnings, encode_warnings

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB per file


def validate_image(file: UploadFile) -> None:
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Accepted: {', '.join(ALLOWED_EXTENSIONS)}",
        )


@router.post("/single", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_single(
    file: UploadFile = File(...),
    # disease_category is always required: it identifies which of the three
    # workflows was used, and species/breed validation keys off it.
    disease_category: str = Form(...),
    share_info: bool = Form(False),
    age: Optional[str] = Form(None),
    sex: Optional[str] = Form(None),
    breed: Optional[str] = Form(None),
    area_code: Optional[str] = Form(None),
    preventive_treatment: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a single image and attach the disease workflow context."""
    validate_image(file)

    if disease_category not in DISEASE_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"disease_category must be one of: {sorted(DISEASE_LABELS)}",
        )
    # Look up the workflow metadata (species, preventive_treatment requirement)
    # via label because the form field uses the user-facing string.
    disease = next(d for d in DISEASE_BY_ID.values() if d["label"] == disease_category)
    species = disease["species"]

    if share_info and sex is not None and sex not in VALID_SEX:
        raise HTTPException(
            status_code=400,
            detail=f"sex must be one of: {sorted(VALID_SEX)}",
        )

    # Only Tick Borne collects preventive_treatment; for other flows the answer
    # is irrelevant so we drop anything that leaked through the form.
    if not disease["needs_preventive_treatment"]:
        preventive_treatment = None
    elif share_info and preventive_treatment is None:
        raise HTTPException(
            status_code=400,
            detail="preventive_treatment is required for the Tick Borne workflow",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File '{file.filename}' exceeds maximum size of 20MB",
        )

    # Allocate the image row first to obtain its id, which becomes part of
    # the on-disk path (uploads/{user_id}/{image_id}/...).
    image = Image(
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename="",  # filled in after we have the id
        file_path="",
        file_size=len(content),
        is_preprocessed=False,
    )
    db.add(image)
    db.flush()

    image_dir = os.path.join(UPLOAD_DIR, str(current_user.id), str(image.id))
    os.makedirs(image_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(image_dir, stored_name)

    with open(file_path, "wb") as out:
        out.write(content)

    # Preprocess (detect cassette, crop, rotate, resize) so the user can see
    # a normalized thumbnail immediately. Failure rejects the upload outright.
    preprocessed_name = f"pp_{stored_name}"
    preprocessed_path = os.path.join(image_dir, preprocessed_name)
    try:
        preprocess_cassette(file_path, preprocessed_path)
    except PreprocessingError as e:
        if os.path.exists(image_dir):
            shutil.rmtree(image_dir)
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Image preprocessing failed: {str(e)}",
        )

    image.stored_filename = stored_name
    image.file_path = file_path
    image.preprocessed_filename = preprocessed_name
    image.preprocessed_path = preprocessed_path
    image.is_preprocessed = True
    # Warnings are computed from the chosen workflow and the answers given;
    # they are stored even when share_info is False so we know the advisory
    # fired, even though no patient row gets created in that case.
    image.warnings = encode_warnings(
        compute_warnings(disease_category, species, age if share_info else None)
    )

    if share_info:
        patient = PatientInfo(
            image_id=image.id,
            disease_category=disease_category,
            species=species,
            age=age,
            sex=sex,
            breed=breed,
            area_code=area_code,
            preventive_treatment=preventive_treatment,
        )
        db.add(patient)

    db.commit()
    db.refresh(image)
    return image


@router.get("/images", response_model=list[ImageListItem])
def list_images(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List images. Admin sees everyone's; regular users see only their own."""
    query = db.query(Image).options(joinedload(Image.patient_info))
    if current_user.role != "admin":
        query = query.filter(Image.user_id == current_user.id)
    images = query.order_by(Image.created_at.desc()).all()

    # Pre-fetch usernames to fill in admin's cross-user view.
    if current_user.role == "admin":
        user_ids = {img.user_id for img in images}
        username_map = {
            u.id: u.username
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        }
    else:
        username_map = {current_user.id: current_user.username}

    result = []
    for img in images:
        item = ImageListItem.model_validate(img)
        item.username = username_map.get(img.user_id, "Unknown")
        item.disease_category = (
            img.patient_info.disease_category if img.patient_info else None
        )
        result.append(item)
    return result


@router.get("/image/{image_id}", response_model=ImageResponse)
def get_image_detail(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single image with its patient info. Admin can access any image."""
    query = (
        db.query(Image)
        .options(joinedload(Image.patient_info))
        .filter(Image.id == image_id)
    )
    if current_user.role != "admin":
        query = query.filter(Image.user_id == current_user.id)
    image = query.first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


@router.delete("/image/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an image and its files. Admin can delete any image."""
    query = db.query(Image).filter(Image.id == image_id)
    if current_user.role != "admin":
        query = query.filter(Image.user_id == current_user.id)
    image = query.first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Cancel any active classification task before removing the row.
    if image.reading_status == "running":
        cancel_classification(image.id)

    # Remove the image's directory (file_path lives inside it). For new
    # uploads this is uploads/{user_id}/{image_id}/. Legacy paths share
    # a directory with batch siblings, so only remove the file itself
    # to avoid taking other images down with it.
    image_dir = os.path.join(UPLOAD_DIR, str(image.user_id), str(image.id))
    if image.file_path and os.path.dirname(image.file_path) == image_dir:
        if os.path.exists(image_dir):
            shutil.rmtree(image_dir)
    else:
        for path in (image.file_path, image.preprocessed_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass

    db.delete(image)
    db.commit()


@router.get("/image/{image_id}/file")
def get_image_file(
    image_id: int,
    original: bool = Query(False, description="Set to true to get the original unprocessed image"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve an image file. By default returns the preprocessed version."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if current_user.role != "admin" and image.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if (
        not original
        and image.is_preprocessed
        and image.preprocessed_path
        and os.path.exists(image.preprocessed_path)
    ):
        serve_path = image.preprocessed_path
    else:
        serve_path = image.file_path

    if not os.path.exists(serve_path):
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    return FileResponse(serve_path)
