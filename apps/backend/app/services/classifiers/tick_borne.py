"""Dot-based classifier for Tick Borne SNAP 4Dx Plus style cassettes.

Calibrated against real black-background 4Dx Plus photographs. The pipeline
crops the cassette, resolves the 180 degree orientation using the always
present control spot, extracts a high-resolution membrane window, and scores
five reaction spots with local colour contrast. Each analyte is judged with its
own threshold. Geometry and thresholds are explicit calibrated constants and
remain tunable as more positive samples become available.

Calibration note: anaplasma and heartworm were calibrated from very few
positive samples (3 and 1), so their thresholds carry less statistical weight
than ehrlichia and lyme and should be revisited when more positives exist.
"""

from dataclasses import dataclass
import logging

import cv2
import numpy as np

from app.services.image_preprocessor import (
    STANDARD_HEIGHT,
    STANDARD_WIDTH,
    _detect_cassette_contour,
    _enhance_contrast,
    _straighten_and_crop,
    PreprocessingError,
)
from app.services.classifiers.common import confidence_from_ratios

logger = logging.getLogger(__name__)

WORKFLOW_LABEL = "Tick Borne"

ANALYTE_NAMES = ("ehrlichia", "lyme", "anaplasma", "heartworm")

DISPLAY_NAMES = {
    "ehrlichia": "Ehrlichia",
    "lyme": "Lyme",
    "anaplasma": "Anaplasma",
    "heartworm": "Heartworm",
}

# Membrane window as fractions of the landscape cassette crop, in the canonical
# pose where the sample well sits on the left and the snap logo on the right.
MEMBRANE_X = (0.26, 0.56)
MEMBRANE_Y = (0.26, 0.76)
MEMBRANE_WIDTH = 600
MEMBRANE_HEIGHT = 360

# Control spot template position inside the membrane frame (fractions), and the
# four analyte spot centres expressed as pixel offsets from the located control
# centre. Anchoring the analytes to the detected control removes per-photo
# translation so the closely spaced spots do not bleed into one another.
CONTROL_REF = (0.34, 0.68)
ANALYTE_OFFSETS = {
    "anaplasma": (72, -65),
    "ehrlichia": (156, -7),
    "heartworm": (156, -137),
    "lyme": (258, -61),
}

SPOT_RADIUS = 24
ANNULUS_INNER = 1.4
ANNULUS_OUTER = 1.9
SATURATION_WEIGHT = 0.08
HIGH_CHROMA_SAT = 35.0

# Search grids: a wide grid to lock the control spot, a small grid to refine
# each analyte around its anchored position.
CONTROL_SEARCH_X = range(-40, 41, 5)
CONTROL_SEARCH_Y = range(-30, 31, 5)
ANALYTE_SEARCH = (-8, -4, 0, 4, 8)

# Per-spot detection thresholds on the colour-contrast score, calibrated on the
# black-background dataset.
CONTROL_THRESHOLD = 40.0
ANALYTE_THRESHOLDS = {
    "anaplasma": 9.0,
    "ehrlichia": 25.0,
    "heartworm": 45.0,
    "lyme": 16.0,
}


@dataclass(frozen=True)
class SpotScore:
    name: str
    detected: bool
    score: float
    threshold: float
    high_chroma_ratio: float
    center: tuple[int, int]

    def to_dict(self) -> dict:
        return {
            "detected": self.detected,
            "score": round(self.score, 2),
            "threshold": round(self.threshold, 2),
            "high_chroma_ratio": round(self.high_chroma_ratio, 3),
            "center": {"x": int(self.center[0]), "y": int(self.center[1])},
        }


def _score_components(
    lab: np.ndarray,
    hsv: np.ndarray,
    cx: int,
    cy: int,
    radius: int,
) -> tuple[float, float]:
    """Local colour contrast of a disk against its surrounding annulus.

    Returns the contrast score and the high-chroma pixel ratio of the disk.
    The score combines the LAB delta-E between the disk and ring medians with a
    smaller saturation-lift term, which is robust to lighting because it is
    measured relative to the immediate background.
    """
    h, w = lab.shape[:2]
    cx = int(np.clip(cx, 0, max(w - 1, 0)))
    cy = int(np.clip(cy, 0, max(h - 1, 0)))
    radius = max(2, int(radius))

    yy, xx = np.ogrid[:h, :w]
    dist_sq = (xx - cx) ** 2 + (yy - cy) ** 2
    fg_mask = dist_sq <= radius ** 2
    inner = (radius * ANNULUS_INNER) ** 2
    outer = (radius * ANNULUS_OUTER) ** 2
    bg_mask = (dist_sq <= outer) & (dist_sq >= inner)

    if not np.any(fg_mask) or not np.any(bg_mask):
        return 0.0, 0.0

    fg_median = np.median(lab[fg_mask], axis=0)
    bg_median = np.median(lab[bg_mask], axis=0)
    delta_e = float(np.linalg.norm(fg_median - bg_median))

    fg_sat = hsv[:, :, 1][fg_mask]
    bg_sat = hsv[:, :, 1][bg_mask]
    saturation_lift = max(0.0, float(np.median(fg_sat) - np.median(bg_sat)))
    high_chroma_ratio = float(np.mean(fg_sat > HIGH_CHROMA_SAT))

    score = delta_e + SATURATION_WEIGHT * saturation_lift
    return score, high_chroma_ratio


def score_spot(
    img_bgr: np.ndarray,
    name: str,
    center: tuple[int, int],
    radius: int,
    threshold: float,
) -> SpotScore:
    """Score a single circular reaction spot against its local background."""
    if img_bgr.size == 0:
        return SpotScore(name, False, 0.0, threshold, 0.0, center)

    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    cx = int(np.clip(center[0], 0, max(img_bgr.shape[1] - 1, 0)))
    cy = int(np.clip(center[1], 0, max(img_bgr.shape[0] - 1, 0)))
    score, high_chroma_ratio = _score_components(lab, hsv, cx, cy, radius)

    return SpotScore(
        name=name,
        detected=score >= threshold,
        score=round(score, 2),
        threshold=threshold,
        high_chroma_ratio=round(high_chroma_ratio, 3),
        center=(cx, cy),
    )


def _best_spot(
    lab: np.ndarray,
    hsv: np.ndarray,
    name: str,
    cx0: float,
    cy0: float,
    search_x,
    search_y,
    threshold: float,
) -> SpotScore:
    """Search a small grid around an expected centre for the strongest spot."""
    best_score = -1.0
    best_center = (int(cx0), int(cy0))
    best_chroma = 0.0
    for dy in search_y:
        for dx in search_x:
            cx = int(cx0 + dx)
            cy = int(cy0 + dy)
            score, chroma = _score_components(lab, hsv, cx, cy, SPOT_RADIUS)
            if score > best_score:
                best_score = score
                best_center = (cx, cy)
                best_chroma = chroma
    return SpotScore(
        name=name,
        detected=best_score >= threshold,
        score=round(best_score, 2),
        threshold=threshold,
        high_chroma_ratio=round(best_chroma, 3),
        center=best_center,
    )


def _control_spot(lab: np.ndarray, hsv: np.ndarray) -> SpotScore:
    """Locate the control spot with a wide search around its template position."""
    cx0 = CONTROL_REF[0] * MEMBRANE_WIDTH
    cy0 = CONTROL_REF[1] * MEMBRANE_HEIGHT
    return _best_spot(
        lab, hsv, "control", cx0, cy0,
        CONTROL_SEARCH_X, CONTROL_SEARCH_Y, CONTROL_THRESHOLD,
    )


def detect_spots(membrane_bgr: np.ndarray) -> dict[str, SpotScore]:
    """Detect all five spots in a normalized, oriented membrane frame."""
    lab = cv2.cvtColor(membrane_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(membrane_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)

    control = _control_spot(lab, hsv)
    scores: dict[str, SpotScore] = {"control": control}

    cx, cy = control.center
    for name in ANALYTE_NAMES:
        ox, oy = ANALYTE_OFFSETS[name]
        scores[name] = _best_spot(
            lab, hsv, name, cx + ox, cy + oy,
            ANALYTE_SEARCH, ANALYTE_SEARCH, ANALYTE_THRESHOLDS[name],
        )
    return scores


def classify_from_spot_scores(scores: dict[str, SpotScore]) -> dict:
    """Apply SNAP 4Dx Plus style control and per-analyte rules."""
    control = scores.get("control")
    analytes = {
        name: "Positive" if scores[name].detected else "Negative"
        for name in ANALYTE_NAMES
    }

    if control is None or not control.detected:
        detail = {
            "workflow": WORKFLOW_LABEL,
            "overall": "Invalid",
            "control": "Invalid",
            "analytes": analytes,
            "confidence": "low",
            "spots": {name: score.to_dict() for name, score in scores.items()},
        }
        return {"summary": "Invalid", "confidence": "low", "detail": detail}

    positives = [name for name, value in analytes.items() if value == "Positive"]
    overall = "Positive" if positives else "Negative"

    ratios = [control.score / control.threshold]
    ratios.extend(
        scores[name].score / scores[name].threshold
        for name in positives
        if scores[name].threshold > 0
    )
    confidence = confidence_from_ratios(ratios)

    if positives:
        positive_labels = ", ".join(DISPLAY_NAMES[name] for name in positives)
        summary = f"Positive: {positive_labels}"
    else:
        summary = "Negative"

    detail = {
        "workflow": WORKFLOW_LABEL,
        "overall": overall,
        "control": "Valid",
        "analytes": analytes,
        "confidence": confidence,
        "spots": {name: score.to_dict() for name, score in scores.items()},
    }
    return {"summary": summary, "confidence": confidence, "detail": detail}


def classify_result_window(membrane_bgr: np.ndarray) -> dict:
    """Classify an already extracted, oriented Tick Borne membrane frame."""
    return classify_from_spot_scores(detect_spots(membrane_bgr))


def classify_single_image(file_path: str) -> tuple[str, str, dict]:
    """Classify one full Tick Borne cassette photo."""
    membrane = _read_membrane(file_path)
    result = classify_result_window(membrane)
    return result["summary"], result["confidence"], result["detail"]


def preprocess_cassette_image(input_path: str, output_path: str) -> None:
    """Write a normalized Tick Borne membrane preview image."""
    membrane = _read_membrane(input_path)
    enhanced = _enhance_contrast(membrane)
    result = cv2.resize(
        enhanced,
        (STANDARD_WIDTH, STANDARD_HEIGHT),
        interpolation=cv2.INTER_AREA,
    )
    success = cv2.imwrite(output_path, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise PreprocessingError("Failed to write preprocessed image to disk")


def _read_membrane(file_path: str) -> np.ndarray:
    """Read a photo and return the oriented, normalized membrane frame."""
    img = cv2.imread(file_path)
    if img is None:
        raise PreprocessingError("Cannot read image file")
    cassette = _crop_cassette(img)
    return _oriented_membrane(cassette)


def _crop_cassette(img: np.ndarray) -> np.ndarray:
    """Crop the straightened cassette in landscape orientation.

    Tries the shared border detector first; on dark backgrounds where its
    aspect and fill filters reject a clean shot, falls back to the largest
    bright blob, which separates the white cassette from the dark surface.
    """
    try:
        contour = _detect_cassette_contour(img)
    except PreprocessingError:
        contour = _largest_bright_contour(img)
        if contour is None:
            raise
    cassette = _straighten_and_crop(img, contour)
    if cassette.shape[0] > cassette.shape[1]:
        cassette = cv2.rotate(cassette, cv2.ROTATE_90_CLOCKWISE)
    return cassette


def _largest_bright_contour(img: np.ndarray) -> np.ndarray | None:
    """Largest elongated bright blob, used as a dark-background crop fallback."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (7, 7), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    total = img.shape[0] * img.shape[1]
    best = None
    best_area = 0.05 * total
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area <= best_area or area > 0.95 * total:
            continue
        _, _, bw, bh = cv2.boundingRect(cnt)
        long_side, short_side = max(bw, bh), min(bw, bh)
        if short_side == 0 or long_side / short_side < 1.6:
            continue
        best = cnt
        best_area = area
    return best


def _crop_membrane(cassette: np.ndarray) -> np.ndarray:
    """Crop and resize the membrane window from a landscape cassette."""
    h, w = cassette.shape[:2]
    sub = cassette[
        int(MEMBRANE_Y[0] * h):int(MEMBRANE_Y[1] * h),
        int(MEMBRANE_X[0] * w):int(MEMBRANE_X[1] * w),
    ]
    if sub.size == 0:
        raise PreprocessingError("Tick Borne membrane extraction failed")
    return cv2.resize(
        sub, (MEMBRANE_WIDTH, MEMBRANE_HEIGHT), interpolation=cv2.INTER_AREA
    )


def _oriented_membrane(cassette: np.ndarray) -> np.ndarray:
    """Pick the 180 degree pose whose control spot scores higher.

    The control spot is always present and only lights up at its template
    position when the cassette is oriented correctly, so its colour-contrast
    score is a reliable orientation oracle that does not depend on the variable
    sample-well colour or on which analytes happen to be positive.
    """
    frame_a = _crop_membrane(cassette)
    frame_b = _crop_membrane(cv2.rotate(cassette, cv2.ROTATE_180))
    if _control_score(frame_a) >= _control_score(frame_b):
        return frame_a
    return frame_b


def _control_score(membrane_bgr: np.ndarray) -> float:
    lab = cv2.cvtColor(membrane_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(membrane_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    return _control_spot(lab, hsv).score
