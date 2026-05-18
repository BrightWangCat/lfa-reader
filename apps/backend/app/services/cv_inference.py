"""Background orchestration for workflow-specific CV classification."""

import os
import threading
import traceback

from sqlalchemy.orm import Session

from app.models import Image
from app.services.classification_dispatcher import (
    classify_image_record,
    preprocess_image_for_workflow,
)
from app.services.classifiers.common import encode_detail
from app.services.image_preprocessor import PreprocessingError


_active_tasks: dict[int, dict] = {}


def classify_image(image_id: int, db_factory) -> None:
    """Run CV classification for a single image in a background thread."""
    db: Session = db_factory()
    try:
        image = db.query(Image).filter(Image.id == image_id).first()
        if not image:
            return

        image.reading_status = "running"
        image.reading_error = None
        db.commit()

        task_info = _active_tasks.get(image_id)
        if task_info and task_info.get("cancel"):
            print(f"[CV] Image {image_id} cancelled before processing")
            image.reading_status = None
            image.reading_error = None
            db.commit()
            return

        if not os.path.exists(image.file_path):
            print(f"[CV] Image {image_id}: file not found {image.file_path}")
            image.cv_result = "Invalid"
            image.cv_confidence = "low"
            image.cv_result_detail = None
            image.reading_status = "completed"
            db.commit()
            return

        if image.preprocessed_path:
            try:
                disease_category = (
                    image.patient_info.disease_category
                    if image.patient_info is not None
                    else None
                )
                preprocess_image_for_workflow(
                    image.file_path,
                    image.preprocessed_path,
                    disease_category,
                )
                image.is_preprocessed = True
            except PreprocessingError as e:
                print(f"[CV] Image {image_id} preprocess warning: {e}")
            except Exception as e:
                print(f"[CV] Image {image_id} preprocess warning: {e}")

        try:
            result = classify_image_record(image)
            image.cv_result = result.summary
            image.cv_confidence = result.confidence
            image.cv_result_detail = encode_detail(result.detail)
            print(
                f"[CV] Image {image_id} result: "
                f"{result.summary} ({result.confidence})"
            )
        except PreprocessingError as e:
            print(f"[CV] Image {image_id} classification failed: {e}")
            image.cv_result = "Invalid"
            image.cv_confidence = "low"
            image.cv_result_detail = None
        except Exception as e:
            print(f"[CV] Image {image_id} error: {e}")
            image.cv_result = "Invalid"
            image.cv_confidence = "low"
            image.cv_result_detail = None

        image.reading_status = "completed"
        image.reading_error = None
        db.commit()

    except Exception as e:
        error_msg = f"CV classification error: {str(e)}"
        print(f"[CV] FATAL ERROR for image {image_id}: {error_msg}")
        traceback.print_exc()
        try:
            image = db.query(Image).filter(Image.id == image_id).first()
            if image:
                image.reading_status = "failed"
                image.reading_error = error_msg[:500]
                db.commit()
        except Exception:
            pass
    finally:
        _active_tasks.pop(image_id, None)
        db.close()


def start_classification(image_id: int, db_factory) -> None:
    """Launch CV classification in a background thread."""
    task_info = {"cancel": False}
    _active_tasks[image_id] = task_info
    thread = threading.Thread(
        target=classify_image,
        args=(image_id, db_factory),
        daemon=True,
    )
    thread.start()


def cancel_classification(image_id: int) -> bool:
    """Request cancellation of an active CV classification task."""
    task_info = _active_tasks.get(image_id)
    if task_info is not None:
        task_info["cancel"] = True
        return True
    return False


def is_task_active(image_id: int) -> bool:
    """Check whether a CV classification task is currently running."""
    return image_id in _active_tasks
