import os
import shutil
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import User, UploadBatch, Image, PatientInfo
from app.schemas import BatchResponse, BatchListResponse, PatientInfoResponse
from app.auth import get_current_user, require_admin, require_batch_or_admin
from app.config import UPLOAD_DIR
from app.services.claude_inference import cancel_classification
from app.services.image_preprocessor_for_LLM import preprocess_cassette, PreprocessingError

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


@router.post("/single", status_code=status.HTTP_201_CREATED)
async def upload_single(
    file: UploadFile = File(...),
    share_info: bool = Form(False),
    species: Optional[str] = Form(None),
    age: Optional[str] = Form(None),
    sex: Optional[str] = Form(None),
    breed: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a single image with optional patient info."""
    # Validate file type
    validate_image(file)

    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File '{file.filename}' exceeds maximum size of 20MB",
        )

    # Auto-generate batch name
    now = datetime.now()
    batch_name = now.strftime("Single_%Y%m%d_%H%M%S")

    # Create batch record
    batch = UploadBatch(
        user_id=current_user.id,
        name=batch_name,
        total_images=1,
    )
    db.add(batch)
    db.flush()

    # Save file to disk
    batch_dir = os.path.join(UPLOAD_DIR, str(current_user.id), str(batch.id))
    os.makedirs(batch_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(batch_dir, stored_name)

    with open(file_path, "wb") as out:
        out.write(content)

    # Preprocess: detect cassette, crop, rotate, resize
    preprocessed_name = f"pp_{stored_name}"
    preprocessed_path = os.path.join(batch_dir, preprocessed_name)
    try:
        preprocess_cassette(file_path, preprocessed_path)
    except PreprocessingError as e:
        # Preprocessing failed: clean up files and reject upload
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Image preprocessing failed: {str(e)}",
        )

    # Create image record (with both original and preprocessed paths)
    image = Image(
        batch_id=batch.id,
        original_filename=file.filename,
        stored_filename=stored_name,
        file_path=file_path,
        file_size=len(content),
        preprocessed_filename=preprocessed_name,
        preprocessed_path=preprocessed_path,
        is_preprocessed=True,
    )
    db.add(image)
    db.flush()

    # Create patient info if sharing
    patient_info_response = None
    if share_info:
        if sex is not None and sex not in ("M", "F", "CM", "SF"):
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail="sex must be one of: M, F, CM, SF",
            )

        patient = PatientInfo(
            image_id=image.id,
            species=species,
            age=age,
            sex=sex,
            breed=breed,
            zip_code=zip_code,
        )
        db.add(patient)
        db.flush()
        patient_info_response = PatientInfoResponse.model_validate(patient)

    db.commit()

    result = {
        "batch_id": batch.id,
        "image_id": image.id,
    }
    if patient_info_response:
        result["patient_info"] = patient_info_response.model_dump()
    else:
        result["patient_info"] = None

    return result


@router.post("/batch", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def upload_batch(
    files: list[UploadFile] = File(...),
    batch_name: Optional[str] = Form(None),
    current_user: User = Depends(require_batch_or_admin),
    db: Session = Depends(get_db),
):
    """Upload one or more images as a batch. Requires batch or admin role."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Validate all files first
    for f in files:
        validate_image(f)

    # Create batch record
    batch = UploadBatch(
        user_id=current_user.id,
        name=batch_name,
        total_images=len(files),
    )
    db.add(batch)
    db.flush()  # Get batch.id without committing

    # Create user-specific upload directory
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    batch_dir = os.path.join(user_dir, str(batch.id))
    os.makedirs(batch_dir, exist_ok=True)

    # Save files and preprocess each one
    for f in files:
        content = await f.read()

        if len(content) > MAX_FILE_SIZE:
            # Clean up already-saved files
            if os.path.exists(batch_dir):
                shutil.rmtree(batch_dir)
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' exceeds maximum size of 20MB",
            )

        ext = os.path.splitext(f.filename)[1].lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(batch_dir, stored_name)

        with open(file_path, "wb") as out:
            out.write(content)

        # Preprocess: detect cassette, crop, rotate, resize
        preprocessed_name = f"pp_{stored_name}"
        preprocessed_path = os.path.join(batch_dir, preprocessed_name)
        try:
            preprocess_cassette(file_path, preprocessed_path)
        except PreprocessingError as e:
            # Preprocessing failed: clean up entire batch and reject
            if os.path.exists(batch_dir):
                shutil.rmtree(batch_dir)
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Preprocessing failed for '{f.filename}': {str(e)}. "
                    "All images must contain clearly visible FeLV/FIV test cassettes."
                ),
            )

        image = Image(
            batch_id=batch.id,
            original_filename=f.filename,
            stored_filename=stored_name,
            file_path=file_path,
            file_size=len(content),
            preprocessed_filename=preprocessed_name,
            preprocessed_path=preprocessed_path,
            is_preprocessed=True,
        )
        db.add(image)

    db.commit()
    db.refresh(batch)
    return batch


@router.get("/batches", response_model=list[BatchListResponse])
def list_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List batches. Admin sees all batches; regular users see only their own."""
    query = db.query(UploadBatch)
    if not current_user.role == "admin":
        query = query.filter(UploadBatch.user_id == current_user.id)
    batches = query.order_by(UploadBatch.created_at.desc()).all()

    result = []
    for batch in batches:
        data = BatchListResponse.model_validate(batch)
        # Fill in the username for display
        if batch.user_id == current_user.id:
            data.username = current_user.username
        else:
            owner = db.query(User).filter(User.id == batch.user_id).first()
            data.username = owner.username if owner else "Unknown"
        result.append(data)
    return result


@router.get("/batch/{batch_id}", response_model=BatchResponse)
def get_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific batch with all its images. Admin can access any batch."""
    query = (
        db.query(UploadBatch)
        .options(joinedload(UploadBatch.images).joinedload(Image.patient_info))
        .filter(UploadBatch.id == batch_id)
    )
    if not current_user.role == "admin":
        query = query.filter(UploadBatch.user_id == current_user.id)
    batch = query.first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.delete("/batch/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a batch and all its images. Admin can delete any batch."""
    query = db.query(UploadBatch).filter(UploadBatch.id == batch_id)
    if not current_user.role == "admin":
        query = query.filter(UploadBatch.user_id == current_user.id)
    batch = query.first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Cancel any active classification task
    if batch.reading_status == "running":
        cancel_classification(batch.id)

    # Delete files from disk (both original and preprocessed images)
    batch_dir = os.path.join(UPLOAD_DIR, str(batch.user_id), str(batch.id))
    if os.path.exists(batch_dir):
        shutil.rmtree(batch_dir)

    db.delete(batch)
    db.commit()


@router.get("/image/{image_id}")
def get_image_file(
    image_id: int,
    original: bool = Query(False, description="Set to true to get the original unprocessed image"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve an uploaded image file.

    By default serves the preprocessed version if available.
    Pass ?original=true to get the original uploaded image.
    """
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Verify ownership (admin can access any image)
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == image.batch_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not current_user.role == "admin" and batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Determine which file to serve: preprocessed by default, original if requested
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
