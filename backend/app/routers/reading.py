from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, SessionLocal
from app.models import User, UploadBatch, Image
from app.auth import get_current_user
from app.config import CLAUDE_DEFAULT_MODEL
from app.services import claude_inference, cv_inference

router = APIRouter(prefix="/api/readings", tags=["readings"])

VALID_CATEGORIES = [
    "Negative",
    "Positive L",
    "Positive I",
    "Positive L+I",
    "Invalid",
]

ALLOWED_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6"]


class ManualCorrectionRequest(BaseModel):
    manual_correction: str


class ClassifyRequest(BaseModel):
    method: str = "cv"       # "cv" for OpenCV band detection, "llm" for Claude API
    model: str | None = None  # Claude model ID, only used when method="llm"


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
        "reading_result": image.reading_result,
        "manual_correction": image.manual_correction,
    }


@router.get("/categories")
def get_categories():
    """Return the list of valid classification categories."""
    return {"categories": VALID_CATEGORIES}


def _any_task_active(batch_id: int) -> bool:
    """Check if any classification task (CV or LLM) is running for a batch."""
    return claude_inference.is_task_active(batch_id) or cv_inference.is_task_active(batch_id)


@router.post("/batch/{batch_id}/classify")
def submit_classification(
    batch_id: int,
    body: ClassifyRequest = ClassifyRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a classification job using CV or Claude API.

    The method field selects the classification engine:
      - "cv": OpenCV band detection with rule-based classification (default)
      - "llm": Claude Vision API classification

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
    if batch.reading_status == "running" and _any_task_active(batch_id):
        raise HTTPException(
            status_code=409,
            detail="Classification already running",
        )

    method = body.method
    if method not in ("cv", "llm"):
        raise HTTPException(
            status_code=400,
            detail="Invalid method. Must be 'cv' or 'llm'.",
        )

    # Validate model selection for LLM method
    model = None
    if method == "llm":
        model = body.model or CLAUDE_DEFAULT_MODEL
        if model not in ALLOWED_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model. Must be one of: {', '.join(ALLOWED_MODELS)}",
            )

    # Clear previous results for the selected method only.
    # This preserves results from the other method for comparison.
    if batch.reading_status in ("completed", "failed"):
        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        for img in images:
            if method == "cv":
                img.cv_result = None
                img.cv_confidence = None
            else:
                img.reading_result = None
                img.reading_confidence = None
        db.commit()

    # Start background classification
    batch.reading_status = "running"
    batch.claude_model = "cv" if method == "cv" else model
    batch.reading_error = None
    db.commit()

    if method == "cv":
        cv_inference.start_classification(batch_id, SessionLocal)
    else:
        claude_inference.start_classification(batch_id, model, SessionLocal)

    return {
        "batch_id": batch_id,
        "reading_status": "running",
        "method": method,
        "claude_model": batch.claude_model,
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

    # Determine which result field to check based on the active method
    is_cv = batch.claude_model == "cv"

    # Detect orphaned "running" status after server restart
    if batch.reading_status == "running" and not _any_task_active(batch_id):
        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        if is_cv:
            classified = sum(1 for img in images if img.cv_result is not None)
        else:
            classified = sum(1 for img in images if img.reading_result is not None)
        if classified < len(images):
            batch.reading_status = "failed"
            batch.reading_error = (
                "Classification task was interrupted. "
                "Please re-run the classification."
            )
            db.commit()

    images = db.query(Image).filter(Image.batch_id == batch_id).all()
    total = len(images)
    if is_cv:
        classified = sum(1 for img in images if img.cv_result is not None)
    else:
        classified = sum(1 for img in images if img.reading_result is not None)

    return {
        "batch_id": batch_id,
        "reading_status": batch.reading_status,
        "claude_model": batch.claude_model,
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

    claude_inference.cancel_classification(batch_id)
    cv_inference.cancel_classification(batch_id)

    # Update status immediately for UI responsiveness.
    # The background thread will also set these when it detects the flag.
    batch.reading_status = None
    batch.reading_error = None
    db.commit()

    return {"batch_id": batch_id, "reading_status": None}
