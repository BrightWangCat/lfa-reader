"""
Inference service for FeLV/FIV LFA classification using Anthropic Claude API.

Each image is sent individually to the Claude API as a base64-encoded image
with the classification prompt. Results are written to the database
progressively so the frontend can display real-time progress.
"""
import base64
import json
import mimetypes
import os
import threading
import traceback

import anthropic
from sqlalchemy.orm import Session

from app.config import ANTHROPIC_API_KEY
from app.models import UploadBatch, Image


# Classification prompt for reading the preprocessed FeLV/FIV LFA test strip.
# The input image is a cropped, contrast-enhanced reading window showing
# only the test strip area with C/L/I line positions.
CLASSIFICATION_PROMPT = """You are an expert in veterinary diagnostics, reading FeLV/FIV lateral flow assay (LFA) test strips.

The image shows ONLY the white test strip from an LFA cassette. All text labels have been cropped out. The strip contains three band positions arranged LEFT to RIGHT:
- Position 1 (leftmost): C (Control) band
- Position 2 (center): L (FeLV test) band
- Position 3 (rightmost): I (FIV test) band

A band appears as a horizontal colored line (red, purple, or pink) on the white strip. The image has been contrast-enhanced to make even faint bands visible.

Classify into exactly ONE of these 5 categories:
1. Negative - ONLY the leftmost C band is visible; NO colored line at center L or rightmost I positions
2. Positive L - C band visible AND a colored line at the CENTER (L) position
3. Positive I - C band visible AND a colored line at the RIGHTMOST (I) position
4. Positive L+I - C band visible AND colored lines at BOTH center L and rightmost I positions
5. Invalid - No C band visible at the leftmost position

CRITICAL RULES:
- There are exactly 3 possible band positions on the strip from left to right: C, L, I
- ANY visible colored line or faint shadow at L or I means POSITIVE, never Negative
- When in doubt between Negative and Positive, always choose Positive
- Check the leftmost position (C) first: if no band there -> Invalid
- A strip showing only one band at the leftmost position is Negative

Respond with ONLY a JSON object:
{"category": "<one of the 5 categories>", "confidence": "<high/medium/low>", "reasoning": "<brief explanation>"}"""

VALID_CATEGORIES = {
    "Negative", "Positive L", "Positive I", "Positive L+I", "Invalid",
}

# Active classification tasks keyed by batch_id.
# Each value is a dict with a "cancel" flag for cooperative cancellation.
_active_tasks: dict[int, dict] = {}


def parse_model_response(response_text: str) -> tuple[str, str]:
    """Parse the model's response into (category, confidence).

    Attempts JSON extraction first. Falls back to text matching against
    known category names (longer names tested first to avoid partial hits).
    Returns ("Invalid", "low") if nothing matches.
    """
    # Try JSON parsing first
    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(response_text[start:end])
            category = data.get("category", "").strip()
            confidence = data.get("confidence", "unknown").strip()
            if category in VALID_CATEGORIES:
                return category, confidence
    except (json.JSONDecodeError, AttributeError):
        pass

    # Fallback: match against known categories (longer first to avoid partial matches)
    response_lower = response_text.lower()
    ordered_categories = [
        "Positive L+I",
        "Positive L", "Positive I",
        "Negative", "Invalid",
    ]
    for cat in ordered_categories:
        if cat.lower() in response_lower:
            return cat, "low"

    return "Invalid", "low"


def _encode_image(file_path: str) -> tuple[str, str]:
    """Read an image file and return (base64_data, media_type)."""
    media_type, _ = mimetypes.guess_type(file_path)
    if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        media_type = "image/jpeg"
    with open(file_path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return data, media_type


def classify_batch(batch_id: int, model: str, db_factory) -> None:
    """Run classification for all images in a batch.

    Intended to run in a background thread. Processes images sequentially,
    calling the Claude API once per image. Updates the database after each
    image so the frontend can show real-time progress.

    Args:
        batch_id: The ID of the UploadBatch to classify.
        model: The Claude model ID (e.g. "claude-sonnet-4-6").
        db_factory: A SQLAlchemy sessionmaker to create a thread-local session.
    """
    db: Session = db_factory()
    try:
        batch = db.query(UploadBatch).filter(
            UploadBatch.id == batch_id
        ).first()
        if not batch:
            return

        batch.reading_status = "running"
        db.commit()

        # Fail fast if API key is missing
        if not ANTHROPIC_API_KEY:
            batch.reading_status = "failed"
            batch.reading_error = (
                "ANTHROPIC_API_KEY is not set. "
                "Please configure the environment variable and retry."
            )
            db.commit()
            print(f"[Claude API] Batch {batch_id} failed: API key not set")
            return

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        images = db.query(Image).filter(
            Image.batch_id == batch_id
        ).order_by(Image.id).all()

        total = len(images)
        print(f"[Claude API] Processing {total} images for batch {batch_id} "
              f"using model {model}")

        task_info = _active_tasks.get(batch_id, {})

        for idx, img in enumerate(images, 1):
            # Check cooperative cancellation flag between images
            if task_info.get("cancel"):
                print(f"[Claude API] Batch {batch_id} cancelled at image {idx}/{total}")
                batch.reading_status = None
                batch.reading_error = None
                db.commit()
                return

            if not os.path.exists(img.file_path):
                print(f"[Claude API] [{idx}/{total}] File not found: {img.file_path}")
                img.reading_result = "Invalid"
                img.reading_confidence = "low"
                db.commit()
                continue

            try:
                # Use preprocessed image for inference if available
                inference_path = img.file_path
                if (
                    img.is_preprocessed
                    and img.preprocessed_path
                    and os.path.exists(img.preprocessed_path)
                ):
                    inference_path = img.preprocessed_path

                print(f"[Claude API] [{idx}/{total}] Processing: "
                      f"{img.original_filename}")

                image_data, media_type = _encode_image(inference_path)

                # Call Claude API with image + classification prompt.
                # Image is placed before text for optimal performance.
                message = client.messages.create(
                    model=model,
                    max_tokens=300,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data,
                                },
                            },
                            {
                                "type": "text",
                                "text": CLASSIFICATION_PROMPT,
                            },
                        ],
                    }],
                )

                response_text = message.content[0].text
                print(f"[Claude API] [{idx}/{total}] Raw response: "
                      f"{response_text[:200]}")

                category, confidence = parse_model_response(response_text)
                print(f"[Claude API] [{idx}/{total}] Result: {category} "
                      f"(confidence: {confidence})")

                img.reading_result = category
                img.reading_confidence = confidence
                db.commit()

            except anthropic.AuthenticationError as e:
                # Authentication failure is unrecoverable; abort entire batch
                error_msg = f"API authentication failed: {e}"
                print(f"[Claude API] [{idx}/{total}] {error_msg}")
                batch.reading_status = "failed"
                batch.reading_error = error_msg[:500]
                db.commit()
                return

            except anthropic.APIError as e:
                print(f"[Claude API] [{idx}/{total}] API error: {e}")
                img.reading_result = "Invalid"
                img.reading_confidence = "low"
                db.commit()

            except Exception as e:
                print(f"[Claude API] [{idx}/{total}] Error processing "
                      f"image {img.id}: {e}")
                img.reading_result = "Invalid"
                img.reading_confidence = "low"
                db.commit()

        batch.reading_status = "completed"
        db.commit()
        print(f"[Claude API] Batch {batch_id} classification complete.")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"[Claude API] FATAL ERROR for batch {batch_id}: {error_msg}")
        traceback.print_exc()
        try:
            batch = db.query(UploadBatch).filter(
                UploadBatch.id == batch_id
            ).first()
            if batch:
                batch.reading_status = "failed"
                batch.reading_error = error_msg[:500]
                db.commit()
        except Exception:
            pass
    finally:
        _active_tasks.pop(batch_id, None)
        db.close()


def start_classification(batch_id: int, model: str, db_factory) -> None:
    """Launch classification in a background thread.

    The thread runs as a daemon so it does not prevent server shutdown.
    Progress is tracked via the database; the frontend polls the status
    endpoint to display real-time updates.
    """
    task_info = {"cancel": False}
    _active_tasks[batch_id] = task_info
    thread = threading.Thread(
        target=classify_batch,
        args=(batch_id, model, db_factory),
        daemon=True,
    )
    thread.start()


def cancel_classification(batch_id: int) -> bool:
    """Request cancellation of an active classification task.

    Sets a cooperative cancellation flag that the background thread checks
    between image processing iterations.

    Returns True if an active task was found and flagged for cancellation.
    """
    task_info = _active_tasks.get(batch_id)
    if task_info is not None:
        task_info["cancel"] = True
        return True
    return False


def is_task_active(batch_id: int) -> bool:
    """Check whether a classification task is currently running for a batch."""
    return batch_id in _active_tasks
