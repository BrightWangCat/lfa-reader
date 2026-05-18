"""Line-based classifier for FeLV/FIV lateral-flow cassettes."""

import logging

import cv2
import numpy as np

from app.services.image_preprocessor import (
    _detect_cassette_contour,
    _straighten_and_crop,
    _correct_horizontal_direction,
    _extract_reading_window,
    preprocess_cassette,
    PreprocessingError,
)

logger = logging.getLogger(__name__)

WORKFLOW_LABEL = "FIV/FeLV"

VALID_CATEGORIES = {
    "Negative", "Positive L", "Positive I", "Positive L+I", "Invalid",
}

C_LINE_P99_THRESHOLD = 6.0
ADAPTIVE_P99_RATIO = 0.35
LI_P99_ABSOLUTE_MIN = 4.0
PROMINENCE_THRESHOLD = 0.8
COLUMN_SMOOTH_KERNEL = 11
COLUMN_PROFILE_PERCENTILE = 80
DUAL_BAND_MIN_RATIO = 0.7
C_SEARCH_START = 0.15
C_SEARCH_END = 0.55
L_OFFSET_FROM_C = 0.135
I_OFFSET_FROM_C = 0.27
BAND_ZONE_HALF_WIDTH = 0.07


def _preprocess_for_cv(file_path: str) -> np.ndarray:
    """Read an image and extract the oriented cassette for FeLV/FIV analysis."""
    img = cv2.imread(file_path)
    if img is None:
        raise PreprocessingError("Cannot read image file")

    contour = _detect_cassette_contour(img)
    cropped = _straighten_and_crop(img, contour)

    h, w = cropped.shape[:2]
    if h > w:
        cropped = cv2.rotate(cropped, cv2.ROTATE_90_CLOCKWISE)

    return _correct_horizontal_direction(cropped)


def _extract_strip_region(cassette: np.ndarray) -> np.ndarray:
    """Extract the lower strip area containing the FeLV/FIV bands."""
    window = _extract_reading_window(cassette)
    wh = window.shape[0]
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
                float(np.percentile(zone, 99)) - background_a,
                2,
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

    def zone_prominence(start_frac, end_frac):
        x1 = int(rw * start_frac)
        x2 = int(rw * end_frac)
        zone_profile = col_smooth[x1:x2]
        if len(zone_profile) < 3:
            return 0.0
        edge_min = min(float(zone_profile[0]), float(zone_profile[-1]))
        return float(np.max(zone_profile)) - edge_min

    prominences = {
        "c": round(zone_prominence(*zone_ranges["c"]), 2),
        "l": round(zone_prominence(*zone_ranges["l"]), 2),
        "i": round(zone_prominence(*zone_ranges["i"]), 2),
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

    return {
        "c": c_pass_p99,
        "l": l_detected,
        "i": i_detected,
        "scores": p99_scores,
        "prominences": prominences,
        "background_a": background_a,
        "thresholds": thresholds,
        "zones": zone_ranges,
    }


def classify_from_bands(bands: dict) -> tuple[str, str, dict]:
    """Apply deterministic rules to FeLV/FIV band detection results."""
    c_present = bands["c"]
    l_present = bands["l"]
    i_present = bands["i"]
    scores = bands["scores"]

    thresholds = bands.get(
        "thresholds",
        {"c": C_LINE_P99_THRESHOLD, "l": 5.0, "i": 5.0},
    )
    detected_ratios = []
    for key in ("c", "l", "i"):
        if bands[key] and thresholds.get(key, 0) > 0:
            detected_ratios.append(scores[key] / thresholds[key])

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
        category = "Invalid"
        overall = "Invalid"
    elif l_present and i_present:
        category = "Positive L+I"
        overall = "Positive"
    elif l_present:
        category = "Positive L"
        overall = "Positive"
    elif i_present:
        category = "Positive I"
        overall = "Positive"
    else:
        category = "Negative"
        overall = "Negative"

    detail = {
        "workflow": WORKFLOW_LABEL,
        "overall": overall,
        "bands": {
            "c": bool(c_present),
            "l": bool(l_present),
            "i": bool(i_present),
        },
        "confidence": confidence,
        "scores": bands.get("scores", {}),
        "thresholds": bands.get("thresholds", {}),
        "prominences": bands.get("prominences", {}),
    }
    return category, confidence, detail


def classify_single_image(file_path: str) -> tuple[str, str, dict]:
    """Full FeLV/FIV CV classification pipeline for a single image."""
    cassette = _preprocess_for_cv(file_path)
    strip = _extract_strip_region(cassette)
    bands = detect_bands(strip)
    return classify_from_bands(bands)


def preprocess_cassette_image(input_path: str, output_path: str) -> None:
    """Write the FeLV/FIV strip preview image."""
    preprocess_cassette(input_path, output_path)
