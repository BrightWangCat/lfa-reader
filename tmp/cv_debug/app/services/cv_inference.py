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

from app.models import Image
from app.services.image_preprocessor import (
    _detect_cassette_contour,
    _straighten_and_crop,
    _correct_horizontal_direction,
    _extract_reading_window,
    preprocess_cassette,
    PreprocessingError,
)

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "Negative", "Positive L", "Positive I", "Positive L+I", "Invalid",
}

# ---- Band detection parameters ----
# Two-stage detection: zone-based p99 for sensitivity, then column
# profile prominence for specificity (cross-zone validation).

# Minimum p99 score for the C line (control line). Must be above this
# absolute threshold; below this the result is "Invalid".
# Set to 6.0 to accommodate slightly weak signals from poor lighting
# or minor blur while still rejecting noise (typically 2-3).
C_LINE_P99_THRESHOLD = 6.0

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

# Column profile percentile. Faint bands often occupy only part of the
# strip height, so a high-percentile profile preserves their signal
# better than a full-height mean while remaining robust to single-pixel noise.
COLUMN_PROFILE_PERCENTILE = 80

# When both L and I pass detection, verify it is a genuine dual-positive
# rather than a single band spilling into the adjacent zone. The weaker
# zone's prominence must be at least this fraction of the stronger zone's.
# If the ratio is below this, only the stronger zone is kept.
DUAL_BAND_MIN_RATIO = 0.7

# ---- Dynamic zone positioning ----
# Instead of fixed zone positions, zones are computed relative to the
# detected C band position. This adapts to variations in cassette
# cropping and strip position within the reading window.

# Search range for the C band within the strip (fraction of strip width).
# Excludes the leftmost 15% (FIV label artifact area) and rightmost 45%.
C_SEARCH_START = 0.15
C_SEARCH_END = 0.55

# Band spacing: offset from C band position (fraction of strip width).
# Derived from empirical measurement across multiple cassette images.
# The physical spacing between bands is fixed by manufacturing.
L_OFFSET_FROM_C = 0.135
I_OFFSET_FROM_C = 0.27

# Half-width of each detection zone (fraction of strip width).
# Wide enough to capture the full band signal while minimizing
# cross-zone overlap.
BAND_ZONE_HALF_WIDTH = 0.07

# Active classification tasks keyed by image_id.
_active_tasks: dict[int, dict] = {}


def _preprocess_for_cv(file_path: str) -> np.ndarray:
    """Read an image and extract the oriented cassette for CV analysis."""
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


def _extract_strip_region(cassette: np.ndarray) -> np.ndarray:
    """Extract the test strip region from the cassette image."""
    window = _extract_reading_window(cassette)
    wh = window.shape[0]
    # The lower 45% of the reading window contains the test strip bands.
    # The upper portion has printed text labels (C, L, I) and cassette surface.
    strip = window[int(wh * 0.55):, :]

    if strip.size == 0:
        raise PreprocessingError("Strip region extraction resulted in empty image")

    return strip


def detect_bands(strip_bgr: np.ndarray) -> dict:
    """Detect colored bands using C-anchored dynamic zone positioning."""
    lab = cv2.cvtColor(strip_bgr, cv2.COLOR_BGR2LAB)
    a_channel = lab[:, :, 1].astype(np.float32)
    _, rw = a_channel.shape
    background_a = float(np.median(a_channel))

    col_profile = np.percentile(a_channel, COLUMN_PROFILE_PERCENTILE, axis=0)
    col_smooth = cv2.GaussianBlur(
        col_profile.reshape(1, -1),
        (COLUMN_SMOOTH_KERNEL, 1),
        0,
    ).flatten()

    search_x1 = int(rw * C_SEARCH_START)
    search_x2 = int(rw * C_SEARCH_END)
    search_region = col_smooth[search_x1:search_x2]
    c_peak_local = int(np.argmax(search_region))
    c_peak_col = search_x1 + c_peak_local
    c_pos = c_peak_col / rw

    logger.debug(
        "C band located at col %d (%.3f of strip width)",
        c_peak_col, c_pos,
    )

    hw = BAND_ZONE_HALF_WIDTH
    zone_ranges = {
        "c": (max(c_pos - hw, 0.0), min(c_pos + hw, 1.0)),
        "l": (max(c_pos + L_OFFSET_FROM_C - hw, 0.0),
              min(c_pos + L_OFFSET_FROM_C + hw, 1.0)),
        "i": (max(c_pos + I_OFFSET_FROM_C - hw, 0.0),
              min(c_pos + I_OFFSET_FROM_C + hw, 1.0)),
    }

    zone_slices = {}
    for name, (start, end) in zone_ranges.items():
        zone_slices[name] = a_channel[:, int(rw * start):int(rw * end)]

    p99_scores = {}
    for name, zone in zone_slices.items():
        if zone.size == 0:
            p99_scores[name] = 0.0
        else:
            p99_scores[name] = round(
                float(np.percentile(zone, 99)) - background_a, 2
            )

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

    def _zone_prominence(start_frac, end_frac):
        x1 = int(rw * start_frac)
        x2 = int(rw * end_frac)
        zone_profile = col_smooth[x1:x2]
        if len(zone_profile) < 3:
            return 0.0
        edge_min = min(float(zone_profile[0]), float(zone_profile[-1]))
        return float(np.max(zone_profile)) - edge_min

    prominences = {
        "c": round(_zone_prominence(*zone_ranges["c"]), 2),
        "l": round(_zone_prominence(*zone_ranges["l"]), 2),
        "i": round(_zone_prominence(*zone_ranges["i"]), 2),
    }

    l_detected = l_pass_p99 and prominences["l"] >= PROMINENCE_THRESHOLD
    i_detected = i_pass_p99 and prominences["i"] >= PROMINENCE_THRESHOLD

    if l_detected and i_detected:
        l_prom = prominences["l"]
        i_prom = prominences["i"]
        stronger = max(l_prom, i_prom)
        weaker = min(l_prom, i_prom)
        if stronger > 0 and weaker / stronger < DUAL_BAND_MIN_RATIO:
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
        "zones": zone_ranges,
    }

    for name in ("c", "l", "i"):
        zr = zone_ranges[name]
        logger.debug(
            "Zone %s [%.3f-%.3f]: p99=%.2f (thr=%.2f), "
            "prom=%.2f (thr=%.2f), band=%s",
            name.upper(), zr[0], zr[1],
            p99_scores[name], thresholds[name],
            prominences[name], PROMINENCE_THRESHOLD, results[name],
        )

    return results


def classify_from_bands(bands: dict) -> tuple[str, str]:
    """Apply deterministic rules to band detection results."""
    c_present = bands["c"]
    l_present = bands["l"]
    i_present = bands["i"]
    scores = bands["scores"]

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
    """Full CV classification pipeline for a single image."""
    cassette = _preprocess_for_cv(file_path)
    strip = _extract_strip_region(cassette)
    bands = detect_bands(strip)
    return classify_from_bands(bands)


def classify_image(image_id: int, db_factory) -> None:
    """Run CV classification for a single image in a background thread.

    Updates reading_status / cv_result / cv_confidence on the Image row.
    Honors the cooperative cancellation flag set by cancel_classification().
    """
    db: Session = db_factory()
    try:
        image = db.query(Image).filter(Image.id == image_id).first()
        if not image:
            return

        image.reading_status = "running"
        image.reading_error = None
        db.commit()

        # Cancellation check before doing any heavy work.
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
            image.reading_status = "completed"
            db.commit()
            return

        # Re-run preprocessing so the displayed thumbnail reflects the
        # latest detection algorithm rather than the version saved at upload.
        if image.preprocessed_path:
            try:
                preprocess_cassette(image.file_path, image.preprocessed_path)
                image.is_preprocessed = True
            except PreprocessingError as e:
                print(f"[CV] Image {image_id} preprocess warning: {e}")
            except Exception as e:
                print(f"[CV] Image {image_id} preprocess warning: {e}")

        try:
            category, confidence = classify_single_image(image.file_path)
            image.cv_result = category
            image.cv_confidence = confidence
            print(f"[CV] Image {image_id} result: {category} ({confidence})")
        except PreprocessingError as e:
            print(f"[CV] Image {image_id} classification failed: {e}")
            image.cv_result = "Invalid"
            image.cv_confidence = "low"
        except Exception as e:
            print(f"[CV] Image {image_id} error: {e}")
            image.cv_result = "Invalid"
            image.cv_confidence = "low"

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
