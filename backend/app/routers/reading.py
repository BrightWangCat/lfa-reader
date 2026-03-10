from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, SessionLocal
from app.models import User, UploadBatch, Image
from app.auth import get_current_user
from app.services import cv_inference

router = APIRouter(prefix="/api/readings", tags=["readings"])

VALID_CATEGORIES = [
    "Negative",
    "Positive L",
    "Positive I",
    "Positive L+I",
    "Invalid",
]


class ManualCorrectionRequest(BaseModel):
    manual_correction: str


@router.put("/image/{image_id}/correct")
def correct_reading(
    image_id: int,
    body: ManualCorrectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually correct the reading result for an image."""
    if body.manual_correction not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}",
        )

    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    batch = db.query(UploadBatch).filter(
        UploadBatch.id == image.batch_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not current_user.role == "admin" and batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

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


@router.post("/batch/{batch_id}/classify")
def submit_classification(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a CV classification job for a batch.

    Launches a background thread that processes each image in the batch.
    Progress is tracked in the database and can be polled via /status.
    """
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == batch_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not current_user.role == "admin" and batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Prevent duplicate submissions
    if batch.reading_status == "running" and cv_inference.is_task_active(batch_id):
        raise HTTPException(
            status_code=409,
            detail="Classification already running",
        )

    # Clear previous CV results if re-running
    if batch.reading_status in ("completed", "failed"):
        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        for img in images:
            img.cv_result = None
            img.cv_confidence = None
        db.commit()

    # Start background CV classification
    batch.reading_status = "running"
    batch.classification_model = "cv"
    batch.reading_error = None
    db.commit()

    cv_inference.start_classification(batch_id, SessionLocal)

    return {
        "batch_id": batch_id,
        "reading_status": "running",
        "method": "cv",
    }


@router.get("/batch/{batch_id}/status")
def get_classification_status(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check the status of a classification job for a batch.

    If the batch shows "running" but no background task is active (e.g.
    after a server restart), it is automatically marked as "failed" so
    the user can re-run the classification.
    """
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == batch_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not current_user.role == "admin" and batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Detect orphaned "running" status after server restart
    if batch.reading_status == "running" and not cv_inference.is_task_active(batch_id):
        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        classified = sum(1 for img in images if img.cv_result is not None)
        if classified < len(images):
            batch.reading_status = "failed"
            batch.reading_error = (
                "Classification task was interrupted. "
                "Please re-run the classification."
            )
            db.commit()

    images = db.query(Image).filter(Image.batch_id == batch_id).all()
    total = len(images)
    classified = sum(1 for img in images if img.cv_result is not None)

    return {
        "batch_id": batch_id,
        "reading_status": batch.reading_status,
        "reading_error": batch.reading_error,
        "total_images": total,
        "classified_images": classified,
        "progress": round(classified / total * 100, 1) if total > 0 else 0,
    }


@router.post("/batch/{batch_id}/cancel")
def cancel_classification_endpoint(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a running classification job.

    Sets a cooperative cancellation flag that the background thread checks
    between images. Also updates the batch status immediately for UI feedback.
    """
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == batch_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not current_user.role == "admin" and batch.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if batch.reading_status != "running":
        raise HTTPException(
            status_code=400, detail="No active classification job to cancel",
        )

    cv_inference.cancel_classification(batch_id)

    # Update status immediately for UI responsiveness.
    batch.reading_status = None
    batch.reading_error = None
    db.commit()

    return {"batch_id": batch_id, "reading_status": None}
