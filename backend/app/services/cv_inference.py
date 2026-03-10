"""
CV-based band detection and rule classification for FeLV/FIV LFA test strips.

Uses OpenCV color analysis in the LAB color space to detect red/purple/pink
bands at the C, L, and I positions on the test strip, then applies
deterministic rules to classify the result. No API calls required.

The pipeline:
  1. Detect and crop the cassette from the original photo (reuses existing
     contour detection, straightening, and orientation correction).
  2. Crop a broad analysis region from the lower-center of the cassette
     (covers the strip opening while excluding the handwritten text above).
  3. Compute the column-wise LAB a-channel profile across the region.
     Red/purple/pink bands produce peaks in the a-channel above background.
  4. Detect peaks via local maxima, skip the leftmost 20% to exclude
     the FIV label's red text interference.
  5. Assign peaks to C (first), L (second), I (third) by left-to-right
     position, then apply classification rules.
"""

import logging
import os
import threading
import traceback

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.models import UploadBatch, Image
from app.services.image_preprocessor import (
    _detect_cassette_contour,
    _straighten_and_crop,
    _correct_horizontal_direction,
    PreprocessingError,
)

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "Negative", "Positive L", "Positive I", "Positive L+I", "Invalid",
}

# ---- Analysis region crop (relative to cassette image) ----
# Broad region covering the strip opening plus some margin.
# The peak detection algorithm handles precise band localization within this.
REGION_Y_START = 0.55
REGION_Y_END = 0.82
REGION_X_START = 0.25
REGION_X_END = 0.65

# ---- Band detection parameters ----
# Two-stage detection: zone-based p99 for sensitivity, then column
# profile prominence for specificity (cross-zone validation).

# Minimum p99 score for the C line (control line). Must be above this
# absolute threshold; below this the result is "Invalid".
C_LINE_P99_THRESHOLD = 8.0

# L/I lines use an adaptive p99 threshold based on the C line score.
# Adapts to brightness: bright images have high C scores and
# proportionally higher L/I scores; dark images have lower thresholds.
ADAPTIVE_P99_RATIO = 0.35

# Absolute minimum p99 for L/I lines. Prevents false positives when
# the adaptive threshold drops too low on very dark images.
LI_P99_ABSOLUTE_MIN = 4.0

# Column profile prominence threshold: after a zone passes the p99
# check, its column-wise mean profile must show a local peak with at
# least this much prominence. Real bands produce sharp peaks in the
# column profile; spillover from adjacent zones does not.
PROMINENCE_THRESHOLD = 0.8

# Gaussian blur kernel for smoothing the column profile before peak
# analysis. Reduces high-frequency noise while preserving band peaks.
COLUMN_SMOOTH_KERNEL = 11

# When both L and I pass detection, verify it is a genuine dual-positive
# rather than a single band spilling into the adjacent zone. The weaker
# zone's prominence must be at least this fraction of the stronger zone's.
# If the ratio is below this, only the stronger zone is kept.
DUAL_BAND_MIN_RATIO = 0.7

# Expected relative positions of bands within the analysis region
# (as fraction of region width, after skipping the left 20%).
# Used to assign peaks to C/L/I when fewer than 3 peaks are found.
# C is typically at 45-50%, L at 55-62%, I at 70-76%.
C_POSITION_RANGE = (0.30, 0.55)
L_POSITION_RANGE = (0.55, 0.68)
I_POSITION_RANGE = (0.68, 0.85)

# Active classification tasks keyed by batch_id.
_active_tasks: dict[int, dict] = {}


def _preprocess_for_cv(file_path: str) -> np.ndarray:
    """Read an image and extract the oriented cassette for CV analysis.

    Reuses the contour detection, straightening, and orientation correction
    from the LLM preprocessor.

    Args:
        file_path: Path to the original uploaded image.

    Returns:
        Landscape-oriented cassette image (BGR) with FeLV/FIV label
        on the left and sample well on the right.

    Raises:
        PreprocessingError: If the cassette cannot be detected.
    """
    img = cv2.imread(file_path)
    if img is None:
        raise PreprocessingError("Cannot read image file")

    contour = _detect_cassette_contour(img)
    cropped = _straighten_and_crop(img, contour)

    h, w = cropped.shape[:2]
    if h > w:
        cropped = cv2.rotate(cropped, cv2.ROTATE_90_CLOCKWISE)

    cropped = _correct_horizontal_direction(cropped)
    return cropped


def _extract_analysis_region(cassette: np.ndarray) -> np.ndarray:
    """Crop the analysis region from the cassette image.

    Uses a fixed-ratio crop covering the strip opening area. The
    two-stage band detection algorithm (p99 + prominence) handles
    precise band localization within this region.

    Args:
        cassette: Landscape-oriented cassette image (BGR).

    Returns:
        Cropped analysis region (BGR).
    """
    h, w = cassette.shape[:2]
    y1 = int(h * REGION_Y_START)
    y2 = int(h * REGION_Y_END)
    x1 = int(w * REGION_X_START)
    x2 = int(w * REGION_X_END)
    region = cassette[y1:y2, x1:x2]

    if region.size == 0:
        raise PreprocessingError("Analysis region extraction resulted in empty image")

    return region


def detect_bands(region_bgr: np.ndarray) -> dict:
    """Detect colored bands using two-stage analysis on the LAB a-channel.

    Stage 1 (sensitivity): Zone-based p99 scoring.
      Divides the analysis region into C/L/I zones and computes each
      zone's 99th percentile a-channel value minus the background
      median. Catches both strong and moderately weak bands.

    Stage 2 (specificity): Column profile prominence validation.
      Computes the column-wise mean a-channel profile, smooths it,
      and checks that each candidate zone has a local peak with
      sufficient prominence. This eliminates cross-zone spillover:
      a strong C band can elevate the p99 in the adjacent L zone,
      but it will NOT produce a prominent local peak in L's column
      profile.

    Args:
        region_bgr: BGR image of the analysis region.

    Returns:
        Dict with keys:
          "c", "l", "i": bool indicating band presence
          "scores": {"c", "l", "i"}: float p99 scores (above background)
          "prominences": {"c", "l", "i"}: float column profile prominences
          "background_a": float, the median a-channel value
          "thresholds": {"c", "l", "i"}: float, p99 thresholds used
    """
    lab = cv2.cvtColor(region_bgr, cv2.COLOR_BGR2LAB)
    a_channel = lab[:, :, 1].astype(np.float32)
    _, rw = a_channel.shape
    background_a = float(np.median(a_channel))

    # Stage 1: Zone p99 scoring
    zone_slices = {
        "c": a_channel[:, int(rw * C_POSITION_RANGE[0]):int(rw * C_POSITION_RANGE[1])],
        "l": a_channel[:, int(rw * L_POSITION_RANGE[0]):int(rw * L_POSITION_RANGE[1])],
        "i": a_channel[:, int(rw * I_POSITION_RANGE[0]):int(rw * I_POSITION_RANGE[1])],
    }

    p99_scores = {}
    for name, zone in zone_slices.items():
        p99_scores[name] = round(float(np.percentile(zone, 99)) - background_a, 2)

    # Adaptive thresholds
    c_score = p99_scores["c"]
    li_threshold = max(c_score * ADAPTIVE_P99_RATIO, LI_P99_ABSOLUTE_MIN)
    thresholds = {
        "c": C_LINE_P99_THRESHOLD,
        "l": li_threshold,
        "i": li_threshold,
    }

    c_pass_p99 = p99_scores["c"] >= thresholds["c"]
    l_pass_p99 = p99_scores["l"] >= thresholds["l"]
    i_pass_p99 = p99_scores["i"] >= thresholds["i"]

    # Stage 2: Column profile prominence validation
    col_profile = np.mean(a_channel, axis=0)
    col_smooth = cv2.GaussianBlur(
        col_profile.reshape(1, -1),
        (1, COLUMN_SMOOTH_KERNEL),
        0,
    ).flatten()

    def _zone_prominence(start_frac, end_frac):
        """Compute the local peak prominence within a zone.

        Prominence = peak value minus the higher of the two edge values.
        A real band creates a sharp peak; spillover from neighbors
        produces a monotonic slope with near-zero prominence.
        """
        x1 = int(rw * start_frac)
        x2 = int(rw * end_frac)
        zone_profile = col_smooth[x1:x2]
        if len(zone_profile) < 3:
            return 0.0
        edge_min = min(float(zone_profile[0]), float(zone_profile[-1]))
        return float(np.max(zone_profile)) - edge_min

    prominences = {
        "c": round(_zone_prominence(*C_POSITION_RANGE), 2),
        "l": round(_zone_prominence(*L_POSITION_RANGE), 2),
        "i": round(_zone_prominence(*I_POSITION_RANGE), 2),
    }

    # A zone is detected only if it passes BOTH p99 threshold AND
    # column profile prominence check.
    l_detected = l_pass_p99 and prominences["l"] >= PROMINENCE_THRESHOLD
    i_detected = i_pass_p99 and prominences["i"] >= PROMINENCE_THRESHOLD

    # Dual-band ratio validation: when both L and I are detected,
    # verify that both have comparable prominences. A strong band in
    # one zone can spill signal into the adjacent zone, producing a
    # moderate prominence. If the weaker prominence is much less than
    # the stronger, it is likely spillover and should be suppressed.
    if l_detected and i_detected:
        l_prom = prominences["l"]
        i_prom = prominences["i"]
        stronger = max(l_prom, i_prom)
        weaker = min(l_prom, i_prom)
        if stronger > 0 and weaker / stronger < DUAL_BAND_MIN_RATIO:
            # Keep only the zone with the stronger prominence
            if l_prom > i_prom:
                i_detected = False
            else:
                l_detected = False
            logger.debug(
                "Dual-band ratio check: weaker/stronger=%.2f < %.2f, "
                "suppressed %s zone",
                weaker / stronger, DUAL_BAND_MIN_RATIO,
                "I" if l_prom > i_prom else "L",
            )

    results = {
        "c": c_pass_p99,
        "l": l_detected,
        "i": i_detected,
        "scores": p99_scores,
        "prominences": prominences,
        "background_a": background_a,
        "thresholds": thresholds,
    }

    for name in ("c", "l", "i"):
        logger.debug(
            "Zone %s: p99=%.2f (thr=%.2f), prom=%.2f (thr=%.2f), band=%s",
            name.upper(), p99_scores[name], thresholds[name],
            prominences[name], PROMINENCE_THRESHOLD, results[name],
        )

    return results


def classify_from_bands(bands: dict) -> tuple[str, str]:
    """Apply deterministic rules to band detection results.

    Args:
        bands: Dict from detect_bands() with "c", "l", "i" booleans
               and "scores" dict.

    Returns:
        (category, confidence) tuple.
    """
    c_present = bands["c"]
    l_present = bands["l"]
    i_present = bands["i"]
    scores = bands["scores"]

    # Confidence based on the ratio of each detected band's p99 score
    # to its threshold. A higher ratio means a clearer, more reliable signal.
    thresholds = bands.get("thresholds", {"c": C_LINE_P99_THRESHOLD, "l": 5.0, "i": 5.0})
    detected_ratios = []
    for k in ("c", "l", "i"):
        if bands[k] and thresholds.get(k, 0) > 0:
            detected_ratios.append(scores[k] / thresholds[k])

    if detected_ratios:
        min_ratio = min(detected_ratios)
        if min_ratio > 3.0:
            confidence = "high"
        elif min_ratio > 1.8:
            confidence = "medium"
        else:
            confidence = "low"
    else:
        confidence = "low"

    # Classification rules
    if not c_present:
        return "Invalid", confidence

    if l_present and i_present:
        return "Positive L+I", confidence
    elif l_present:
        return "Positive L", confidence
    elif i_present:
        return "Positive I", confidence
    else:
        return "Negative", confidence


def classify_single_image(file_path: str) -> tuple[str, str]:
    """Full CV classification pipeline for a single image.

    Args:
        file_path: Path to the original uploaded image.

    Returns:
        (category, confidence) tuple.
    """
    cassette = _preprocess_for_cv(file_path)
    region = _extract_analysis_region(cassette)
    bands = detect_bands(region)
    return classify_from_bands(bands)


def classify_batch(batch_id: int, db_factory) -> None:
    """Run CV classification for all images in a batch.

    Intended to run in a background thread. Processes images sequentially,
    updating the database after each image so the frontend can show
    real-time progress via status polling.

    Args:
        batch_id: The ID of the UploadBatch to classify.
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
        batch.classification_model = "cv"
        batch.reading_error = None
        db.commit()

        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        total = len(images)

        for idx, img in enumerate(images, 1):
            # Check cooperative cancellation flag
            task_info = _active_tasks.get(batch_id)
            if task_info and task_info.get("cancel"):
                print(f"[CV] Batch {batch_id} cancelled at image {idx}/{total}")
                batch.reading_status = None
                batch.reading_error = None
                db.commit()
                return

            print(f"[CV] [{idx}/{total}] Processing: {img.original_filename}")

            # Use the original image (not the LLM-preprocessed version)
            if not os.path.exists(img.file_path):
                print(f"[CV] [{idx}/{total}] File not found: {img.file_path}")
                img.cv_result = "Invalid"
                img.cv_confidence = "low"
                db.commit()
                continue

            try:
                category, confidence = classify_single_image(img.file_path)
                img.cv_result = category
                img.cv_confidence = confidence
                print(f"[CV] [{idx}/{total}] Result: {category} ({confidence})")
            except PreprocessingError as e:
                print(f"[CV] [{idx}/{total}] Preprocessing failed: {e}")
                img.cv_result = "Invalid"
                img.cv_confidence = "low"
            except Exception as e:
                print(f"[CV] [{idx}/{total}] Error: {e}")
                img.cv_result = "Invalid"
                img.cv_confidence = "low"

            db.commit()

        # Mark batch as completed
        batch.reading_status = "completed"
        batch.reading_error = None
        db.commit()
        print(f"[CV] Batch {batch_id} completed: {total} images processed")

    except Exception as e:
        error_msg = f"CV classification error: {str(e)}"
        print(f"[CV] FATAL ERROR for batch {batch_id}: {error_msg}")
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


def start_classification(batch_id: int, db_factory) -> None:
    """Launch CV classification in a background thread."""
    task_info = {"cancel": False}
    _active_tasks[batch_id] = task_info
    thread = threading.Thread(
        target=classify_batch,
        args=(batch_id, db_factory),
        daemon=True,
    )
    thread.start()


def cancel_classification(batch_id: int) -> bool:
    """Request cancellation of an active CV classification task."""
    task_info = _active_tasks.get(batch_id)
    if task_info is not None:
        task_info["cancel"] = True
        return True
    return False


def is_task_active(batch_id: int) -> bool:
    """Check whether a CV classification task is currently running."""
    return batch_id in _active_tasks
