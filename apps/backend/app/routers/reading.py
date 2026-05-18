from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, SessionLocal
from app.models import User, Image
from app.auth import get_current_user
from app.services import cv_inference
from app.services.result_categories import (
    FIV_FELV_CATEGORIES,
    is_valid_manual_correction,
)

router = APIRouter(prefix="/api/readings", tags=["readings"])

VALID_CATEGORIES = FIV_FELV_CATEGORIES


class ManualCorrectionRequest(BaseModel):
    manual_correction: str


def _load_image(image_id: int, current_user: User, db: Session) -> Image:
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if current_user.role != "admin" and image.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return image


@router.put("/image/{image_id}/correct")
def correct_reading(
    image_id: int,
    body: ManualCorrectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually correct the reading result for an image."""
    if not is_valid_manual_correction(body.manual_correction):
        raise HTTPException(
            status_code=400,
            detail="Invalid manual correction category",
        )

    image = _load_image(image_id, current_user, db)
    image.manual_correction = body.manual_correction
    db.commit()
    db.refresh(image)

    return {
        "id": image.id,
        "original_filename": image.original_filename,
        "cv_result": image.cv_result,
        "manual_correction": image.manual_correction,
    }


@router.get("/categories")
def get_categories():
    """Return the list of valid classification categories."""
    return {"categories": VALID_CATEGORIES}


@router.post("/image/{image_id}/classify")
def submit_classification(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run CV classification on a single image in a background thread."""
    image = _load_image(image_id, current_user, db)

    if image.reading_status == "running" and cv_inference.is_task_active(image.id):
        raise HTTPException(
            status_code=409,
            detail="Classification already running",
        )

    # Clear any previous result before re-running.
    image.cv_result = None
    image.cv_confidence = None
    image.reading_status = "running"
    image.reading_error = None
    db.commit()

    cv_inference.start_classification(image.id, SessionLocal)

    return {
        "image_id": image.id,
        "reading_status": "running",
    }


@router.get("/image/{image_id}/status")
def get_classification_status(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll classification status. Detects orphaned 'running' state after
    a server restart and converts it to 'failed' so the user can retry."""
    image = _load_image(image_id, current_user, db)

    if image.reading_status == "running" and not cv_inference.is_task_active(image.id):
        if image.cv_result is None:
            image.reading_status = "failed"
            image.reading_error = (
                "Classification task was interrupted. "
                "Please re-run the classification."
            )
            db.commit()

    return {
        "image_id": image.id,
        "reading_status": image.reading_status,
        "reading_error": image.reading_error,
        "cv_result": image.cv_result,
        "cv_confidence": image.cv_confidence,
    }


@router.post("/image/{image_id}/cancel")
def cancel_classification_endpoint(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Request cancellation of an active classification task."""
    image = _load_image(image_id, current_user, db)

    if image.reading_status != "running":
        raise HTTPException(
            status_code=400, detail="No active classification job to cancel",
        )

    cv_inference.cancel_classification(image.id)

    image.reading_status = None
    image.reading_error = None
    db.commit()

    return {"image_id": image.id, "reading_status": None}
