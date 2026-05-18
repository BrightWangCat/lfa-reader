"""Dot-based classifier for Tick Borne SNAP 4Dx Plus style cassettes."""

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

SPOT_LAYOUT = {
    "control": (0.30, 0.20),
    "anaplasma": (0.68, 0.36),
    "ehrlichia": (0.28, 0.50),
    "heartworm": (0.70, 0.58),
    "lyme": (0.36, 0.78),
}

CONTROL_THRESHOLD = 7.0
ANALYTE_THRESHOLD = 6.0
HIGH_CHROMA_RATIO_MIN = 0.08
SPOT_RADIUS_RATIO = 0.075
LOCAL_SEARCH_STEPS = (-0.60, -0.30, 0.0, 0.30, 0.60)


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


def score_spot(
    img_bgr: np.ndarray,
    name: str,
    center: tuple[int, int],
    radius: int,
    threshold: float,
) -> SpotScore:
    """Score a circular reaction spot against its local annulus background."""
    if img_bgr.size == 0:
        return SpotScore(name, False, 0.0, threshold, 0.0, center)

    h, w = img_bgr.shape[:2]
    cx = int(np.clip(center[0], 0, max(w - 1, 0)))
    cy = int(np.clip(center[1], 0, max(h - 1, 0)))
    radius = max(2, int(radius))

    yy, xx = np.ogrid[:h, :w]
    dist_sq = (xx - cx) ** 2 + (yy - cy) ** 2
    fg_mask = dist_sq <= radius ** 2
    annulus_outer = (radius * 2.25) ** 2
    annulus_inner = (radius * 1.35) ** 2
    bg_mask = (dist_sq <= annulus_outer) & (dist_sq >= annulus_inner)

    if not np.any(fg_mask) or not np.any(bg_mask):
        return SpotScore(name, False, 0.0, threshold, 0.0, (cx, cy))

    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)

    fg_lab = lab[fg_mask]
    bg_lab = lab[bg_mask]
    fg_median = np.median(fg_lab, axis=0)
    bg_median = np.median(bg_lab, axis=0)
    delta_e = float(np.linalg.norm(fg_median - bg_median))

    fg_sat = hsv[:, :, 1][fg_mask]
    bg_sat = hsv[:, :, 1][bg_mask]
    saturation_lift = max(0.0, float(np.median(fg_sat) - np.median(bg_sat)))
    high_chroma_ratio = float(np.mean(fg_sat > 35.0))

    score = delta_e + saturation_lift * 0.08
    detected = score >= threshold and high_chroma_ratio >= HIGH_CHROMA_RATIO_MIN

    return SpotScore(
        name=name,
        detected=detected,
        score=round(score, 2),
        threshold=threshold,
        high_chroma_ratio=round(high_chroma_ratio, 3),
        center=(cx, cy),
    )


def detect_spots(window_bgr: np.ndarray) -> dict[str, SpotScore]:
    """Detect all expected Tick Borne spots in a normalized result window."""
    h, w = window_bgr.shape[:2]
    radius = max(4, int(min(h, w) * SPOT_RADIUS_RATIO))
    scores: dict[str, SpotScore] = {}

    for name, (x_frac, y_frac) in SPOT_LAYOUT.items():
        threshold = CONTROL_THRESHOLD if name == "control" else ANALYTE_THRESHOLD
        expected = (int(w * x_frac), int(h * y_frac))
        best = score_spot(window_bgr, name, expected, radius, threshold)
        for dy in LOCAL_SEARCH_STEPS:
            for dx in LOCAL_SEARCH_STEPS:
                candidate_center = (
                    int(expected[0] + dx * radius),
                    int(expected[1] + dy * radius),
                )
                candidate = score_spot(
                    window_bgr,
                    name,
                    candidate_center,
                    radius,
                    threshold,
                )
                if candidate.score > best.score:
                    best = candidate
        scores[name] = best

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


def classify_result_window(window_bgr: np.ndarray) -> dict:
    """Classify an already extracted Tick Borne result window."""
    return classify_from_spot_scores(detect_spots(window_bgr))


def classify_single_image(file_path: str) -> tuple[str, str, dict]:
    """Classify one full Tick Borne cassette photo."""
    window = _read_result_window(file_path)
    result = classify_result_window(window)
    return result["summary"], result["confidence"], result["detail"]


def preprocess_cassette_image(input_path: str, output_path: str) -> None:
    """Write a normalized Tick Borne result-window preview image."""
    window = _read_result_window(input_path)
    enhanced = _enhance_contrast(window)
    result = cv2.resize(
        enhanced,
        (STANDARD_WIDTH, STANDARD_HEIGHT),
        interpolation=cv2.INTER_AREA,
    )
    success = cv2.imwrite(output_path, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise PreprocessingError("Failed to write preprocessed image to disk")


def _read_result_window(file_path: str) -> np.ndarray:
    img = cv2.imread(file_path)
    if img is None:
        raise PreprocessingError("Cannot read image file")

    contour = _detect_cassette_contour(img)
    cassette = _straighten_and_crop(img, contour)
    cassette = _ensure_portrait(cassette)
    cassette = _correct_vertical_direction(cassette)
    return _extract_result_window(cassette)


def _ensure_portrait(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    if w > h:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    return img


def _correct_vertical_direction(img: np.ndarray) -> np.ndarray:
    """Orient cassette with sample well above the result window."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.medianBlur(gray, 5)
    min_radius = max(4, int(w * 0.08))
    max_radius = max(min_radius + 1, int(w * 0.22))
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(20, int(h * 0.25)),
        param1=100,
        param2=28,
        minRadius=min_radius,
        maxRadius=max_radius,
    )

    if circles is not None:
        candidates = np.round(circles[0, :]).astype(int)
        top_half = [c for c in candidates if c[1] < h * 0.45]
        bottom_half = [c for c in candidates if c[1] > h * 0.55]
        if bottom_half and not top_half:
            logger.debug("Tick Borne cassette appears inverted; rotating 180 degrees")
            return cv2.rotate(img, cv2.ROTATE_180)

    top = gray[: h // 3, :]
    bottom = gray[h - h // 3 :, :]
    if float(np.std(bottom)) > float(np.std(top)) * 1.25:
        return cv2.rotate(img, cv2.ROTATE_180)
    return img


def _extract_result_window(cassette: np.ndarray) -> np.ndarray:
    """Extract the central SNAP 4Dx Plus reaction window."""
    h, w = cassette.shape[:2]
    x1 = int(w * 0.24)
    x2 = int(w * 0.76)
    y1 = int(h * 0.28)
    y2 = int(h * 0.62)
    window = cassette[y1:y2, x1:x2]
    if window.size == 0:
        raise PreprocessingError("Tick Borne result window extraction failed")
    return window
