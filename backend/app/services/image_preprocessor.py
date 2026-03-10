"""
LFA test cassette image preprocessing service.

Detects the FeLV/FIV lateral flow assay cassette in an uploaded photo,
crops to the cassette region, rotates to a standardized horizontal
orientation (FeLV FIV label on the left, sample well on the right),
and resizes to a consistent 800x400 output.

Uses OpenCV contour detection with two strategies:
  1. Inverse threshold (THRESH_BINARY_INV) targeting the dark navy border
     against light backgrounds (styrofoam trays).
  2. Normal threshold (THRESH_BINARY) targeting the bright white cassette
     body against dark backgrounds (countertops, tables).
"""

import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Output dimensions for the reading window crop (2:1 aspect ratio)
STANDARD_WIDTH = 600
STANDARD_HEIGHT = 300

# Threshold values to try for isolating the dark cassette border.
# Multiple values improve robustness across different lighting conditions.
THRESHOLD_VALUES = [60, 80, 100, 120]

# Minimum contour area as a fraction of total image area
MIN_CONTOUR_AREA_RATIO = 0.01

# Expected cassette aspect ratio range (long side / short side)
MIN_ASPECT_RATIO = 1.3
MAX_ASPECT_RATIO = 3.5

# Padding ratio added around the detected cassette when cropping (fraction of dimensions)
CROP_PADDING_RATIO = 0.02

# Brightness threshold for dark-background detection.
# If the overall image mean brightness is below this value, the background
# is considered dark and the normal-threshold (bright object) strategy is
# tried before the inverse-threshold (dark border) strategy.
# Set to 120 to cover borderline cases where a small bright cassette
# on a large dark surface produces mean brightness around 100-110.
DARK_BACKGROUND_BRIGHTNESS = 120

# Threshold values for bright-object detection on dark backgrounds.
# Higher values require brighter pixels to be classified as foreground.
BRIGHT_THRESHOLD_VALUES = [140, 160, 180, 200]

# Maximum contour area as a fraction of total image area.
# Contours larger than this are likely the entire background, not the cassette.
MAX_CONTOUR_AREA_RATIO = 0.85


class PreprocessingError(Exception):
    """Raised when cassette detection or image preprocessing fails."""
    pass


def preprocess_cassette(input_path: str, output_path: str) -> None:
    """Detect, crop, rotate, and resize the LFA test cassette in an image.

    Reads the input image, detects the rectangular cassette region using
    its dark border, straightens and crops it, ensures the correct
    horizontal orientation (FeLV/FIV label on left, sample well on right),
    and saves the result at the specified output path.

    Args:
        input_path: Absolute path to the original uploaded image.
        output_path: Absolute path where the preprocessed image will be saved.

    Raises:
        PreprocessingError: If the cassette cannot be detected or the image
            cannot be read. Contains a user-friendly error description.
    """
    # Step 1: Read image
    img = cv2.imread(input_path)
    if img is None:
        raise PreprocessingError("Cannot read image file")

    # Step 2-5: Detect the cassette contour
    contour = _detect_cassette_contour(img)

    # Step 6-7: Straighten and crop
    cropped = _straighten_and_crop(img, contour)

    # Step 8: Ensure landscape orientation
    h, w = cropped.shape[:2]
    if h > w:
        cropped = cv2.rotate(cropped, cv2.ROTATE_90_CLOCKWISE)

    # Step 9: Determine left-right direction using sample well detection
    cropped = _correct_horizontal_direction(cropped)

    # Step 10: Extract the reading window (C/L/I test strip area only)
    window = _extract_reading_window(cropped)

    # Step 10b: Remove the upper region containing "C L I" printed text labels
    # and cassette surface above the strip opening. The actual test strip
    # with colored bands occupies the lower portion of the reading window.
    wh, ww = window.shape[:2]
    strip = window[int(wh * 0.55):, :]

    # Step 11: Enhance brightness and contrast for weak-positive visibility
    enhanced = _enhance_contrast(strip)

    # Step 12: Resize to standard dimensions
    result = cv2.resize(
        enhanced, (STANDARD_WIDTH, STANDARD_HEIGHT),
        interpolation=cv2.INTER_AREA,
    )

    # Step 13: Save
    success = cv2.imwrite(output_path, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise PreprocessingError("Failed to write preprocessed image to disk")


def _find_best_rect_contour(
    contours: list,
    min_area: float,
    max_area: float,
    current_best_area: float = 0,
) -> tuple:
    """Find the best rectangular contour matching cassette shape criteria.

    Filters contours by area range, polygon vertex count (4-8),
    bounding-rect fill ratio (>0.7), and aspect ratio.

    Args:
        contours: List of contours from cv2.findContours.
        min_area: Minimum acceptable contour area.
        max_area: Maximum acceptable contour area.
        current_best_area: Area of the current best candidate to beat.

    Returns:
        Tuple of (best_contour, best_area). best_contour is None if
        no matching contour was found.
    """
    found_contour = None
    found_area = current_best_area

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

        # Accept polygons with 4-8 vertices (rounded corners may add vertices)
        if 4 <= len(approx) <= 8:
            rect = cv2.minAreaRect(cnt)
            rect_w, rect_h = rect[1]
            rect_area = rect_w * rect_h
            if rect_area <= 0:
                continue
            fill_ratio = area / rect_area
            if fill_ratio < 0.7:
                continue
            long_side = max(rect_w, rect_h)
            short_side = min(rect_w, rect_h)
            if short_side > 0:
                aspect = long_side / short_side
                if MIN_ASPECT_RATIO <= aspect <= MAX_ASPECT_RATIO and area > found_area:
                    found_contour = cnt
                    found_area = area

    return found_contour, found_area


def _detect_cassette_contour(img: np.ndarray) -> np.ndarray:
    """Detect the largest approximately-rectangular contour (the cassette border).

    Uses a two-strategy approach:
      1. If the image background is dark (mean brightness below threshold),
         first tries normal thresholding (THRESH_BINARY) to detect the bright
         white cassette body against the dark background.
      2. Always tries inverse thresholding (THRESH_BINARY_INV) to detect the
         dark cassette border against a light background.
      3. Falls back to adaptive thresholding as a last resort.

    Args:
        img: The original BGR image.

    Returns:
        The contour (array of points) of the detected cassette.

    Raises:
        PreprocessingError: If no suitable rectangular contour is found.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    total_area = img.shape[0] * img.shape[1]
    min_area = total_area * MIN_CONTOUR_AREA_RATIO
    max_area = total_area * MAX_CONTOUR_AREA_RATIO
    image_mean_brightness = np.mean(gray)

    best_contour = None
    best_area = 0

    # Strategy 1: Bright-object detection for dark backgrounds.
    # When the overall image is dark, the cassette's white body stands out.
    # Use normal thresholding to isolate bright (white cassette) regions.
    if image_mean_brightness < DARK_BACKGROUND_BRIGHTNESS:
        logger.debug(
            "Dark background detected (mean brightness=%.1f), "
            "trying bright-object detection first",
            image_mean_brightness,
        )
        for thresh_val in BRIGHT_THRESHOLD_VALUES:
            _, thresh = cv2.threshold(
                blurred, thresh_val, 255, cv2.THRESH_BINARY
            )
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            thresh = cv2.morphologyEx(
                thresh, cv2.MORPH_CLOSE, kernel, iterations=3
            )
            contours, _ = cv2.findContours(
                thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            candidate, candidate_area = _find_best_rect_contour(
                contours, min_area, max_area, best_area
            )
            if candidate is not None:
                best_contour = candidate
                best_area = candidate_area

        if best_contour is not None:
            logger.debug("Cassette detected via bright-object strategy")
            return best_contour

    # Strategy 2: Dark-border detection for light backgrounds.
    # Inverse threshold targets the dark navy cassette border against
    # light backgrounds (styrofoam trays, white tables).
    for thresh_val in THRESHOLD_VALUES:
        _, thresh = cv2.threshold(
            blurred, thresh_val, 255, cv2.THRESH_BINARY_INV
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)
        contours, _ = cv2.findContours(
            thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        candidate, candidate_area = _find_best_rect_contour(
            contours, min_area, max_area, best_area
        )
        if candidate is not None:
            best_contour = candidate
            best_area = candidate_area

    if best_contour is not None:
        logger.debug("Cassette detected via dark-border strategy")
        return best_contour

    # Strategy 3: Adaptive thresholding as last resort.
    thresh_adaptive = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 5
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    thresh_adaptive = cv2.morphologyEx(
        thresh_adaptive, cv2.MORPH_CLOSE, kernel, iterations=3
    )
    contours, _ = cv2.findContours(
        thresh_adaptive, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    candidate, candidate_area = _find_best_rect_contour(
        contours, min_area, max_area, best_area
    )
    if candidate is not None:
        best_contour = candidate

    if best_contour is None:
        raise PreprocessingError(
            "Cannot detect cassette border. Please ensure the image contains "
            "a clearly visible FeLV/FIV test cassette."
        )

    logger.debug("Cassette detected via adaptive threshold fallback")
    return best_contour


def _straighten_and_crop(
    img: np.ndarray, contour: np.ndarray
) -> np.ndarray:
    """Straighten the cassette using its rotation angle and crop the region.

    Uses cv2.minAreaRect to determine the rotation angle, then applies
    an affine warp to straighten the image before cropping.

    Args:
        img: The original BGR image.
        contour: The detected cassette contour.

    Returns:
        The straightened and cropped cassette image.
    """
    rect = cv2.minAreaRect(contour)
    center, (w, h), angle = rect

    # Normalize rotation: minAreaRect returns width < height with angle adjustment
    # We want the shorter side as height for a landscape result
    if w < h:
        angle = angle + 90
        w, h = h, w

    # Build rotation matrix and warp the entire image
    img_h, img_w = img.shape[:2]
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

    # Ensure the rotated image is large enough to contain the cassette
    cos_val = abs(rotation_matrix[0, 0])
    sin_val = abs(rotation_matrix[0, 1])
    new_w = int(img_h * sin_val + img_w * cos_val)
    new_h = int(img_h * cos_val + img_w * sin_val)

    # Adjust the rotation matrix for the new canvas size
    rotation_matrix[0, 2] += (new_w - img_w) / 2
    rotation_matrix[1, 2] += (new_h - img_h) / 2

    rotated = cv2.warpAffine(
        img, rotation_matrix, (new_w, new_h),
        borderMode=cv2.BORDER_REPLICATE,
    )

    # Compute the new center after rotation
    new_center_x = int(center[0] * cos_val + center[1] * sin_val
                       + (new_w - img_w) / 2
                       - (center[1] - img_h / 2) * sin_val
                       + (center[0] - img_w / 2) * (cos_val - 1))
    new_center_y = int(-center[0] * sin_val + center[1] * cos_val
                       + (new_h - img_h) / 2
                       + (center[0] - img_w / 2) * sin_val
                       + (center[1] - img_h / 2) * (cos_val - 1))

    # Use a simpler approach: transform the center point through the rotation matrix
    center_arr = np.array([center[0], center[1], 1.0])
    new_center = rotation_matrix @ center_arr
    cx, cy = int(new_center[0]), int(new_center[1])

    # Add padding
    pad_w = int(w * CROP_PADDING_RATIO)
    pad_h = int(h * CROP_PADDING_RATIO)

    half_w = int(w / 2) + pad_w
    half_h = int(h / 2) + pad_h

    # Clamp to image boundaries
    x1 = max(0, cx - half_w)
    y1 = max(0, cy - half_h)
    x2 = min(new_w, cx + half_w)
    y2 = min(new_h, cy + half_h)

    cropped = rotated[y1:y2, x1:x2]

    if cropped.size == 0:
        raise PreprocessingError(
            "Cropping resulted in an empty image. The cassette may be "
            "partially outside the frame."
        )

    return cropped


def _correct_horizontal_direction(img: np.ndarray) -> np.ndarray:
    """Ensure the sample well is on the right side of the image.

    Uses Hough Circle detection to locate the circular sample well.
    If detected in the left half, flips the image 180 degrees.
    Falls back to brightness analysis if circle detection fails.

    Args:
        img: Landscape-oriented cassette image (width > height).

    Returns:
        The image with correct horizontal direction.
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray_blurred = cv2.medianBlur(gray, 5)

    # Attempt circle detection for the sample well
    # The well diameter is roughly 10-20% of the cassette height
    min_radius = int(h * 0.05)
    max_radius = int(h * 0.30)

    circles = cv2.HoughCircles(
        gray_blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=h,
        param1=100,
        param2=30,
        minRadius=min_radius,
        maxRadius=max_radius,
    )

    if circles is not None:
        circles = np.round(circles[0, :]).astype(int)
        # Find the most prominent circle (first result is usually the strongest)
        well_x = circles[0][0]
        mid_x = w // 2

        if well_x < mid_x:
            # Well is on the left; flip so it goes to the right
            img = cv2.rotate(img, cv2.ROTATE_180)
            logger.debug("Sample well detected on left side; flipping 180 degrees")
        else:
            logger.debug("Sample well detected on right side; orientation correct")

        return img

    # Fallback: brightness-based heuristic
    # The sample well area (a hole) tends to be darker than the label area.
    # The FeLV/FIV label side has more text (higher local contrast).
    # Split into left 25% and right 25% and compare standard deviation.
    quarter_w = w // 4
    left_region = gray[:, :quarter_w]
    right_region = gray[:, w - quarter_w:]

    left_std = np.std(left_region)
    right_std = np.std(right_region)

    # The well side typically has a dark circle with higher variance
    # compared to the label side which is more uniformly white/text
    # However, the label side also has text contrast, so we use mean brightness:
    # The well area (dark hole) reduces mean brightness
    left_mean = np.mean(left_region)
    right_mean = np.mean(right_region)

    # If right side is brighter (no dark well hole), the well is on the left
    # Need to flip
    if left_mean < right_mean - 5:
        img = cv2.rotate(img, cv2.ROTATE_180)
        logger.debug(
            "Brightness fallback: left darker (%.1f) than right (%.1f); "
            "flipping 180 degrees", left_mean, right_mean
        )
    else:
        logger.debug(
            "Brightness fallback: keeping current orientation "
            "(left=%.1f, right=%.1f)", left_mean, right_mean
        )

    return img


def _extract_reading_window(cassette_img: np.ndarray) -> np.ndarray:
    """Extract the reading window (C/L/I test strip area) from the cassette.

    The cassette is already oriented with the FeLV/FIV label on the left
    and the sample well on the right. The reading window is the rectangular
    depression in the center of the cassette where the test strip is visible.

    Uses contour detection to find the bright rectangular window region.
    Falls back to a fixed-ratio crop based on typical cassette geometry
    if contour detection fails.

    Args:
        cassette_img: Landscape-oriented cassette image (label left, well right).

    Returns:
        Cropped image of the reading window area.
    """
    h, w = cassette_img.shape[:2]
    gray = cv2.cvtColor(cassette_img, cv2.COLOR_BGR2GRAY)

    # Define a search region in the center of the cassette.
    # Exclude the left 25% (label area) and right 20% (sample well area).
    roi_x1 = int(w * 0.25)
    roi_x2 = int(w * 0.80)
    roi_y1 = int(h * 0.10)
    roi_y2 = int(h * 0.95)
    roi_gray = gray[roi_y1:roi_y2, roi_x1:roi_x2]
    roi_color = cassette_img[roi_y1:roi_y2, roi_x1:roi_x2]

    # The reading window is brighter than the surrounding cassette body.
    # Use Otsu thresholding to separate the bright window from the body.
    blurred = cv2.GaussianBlur(roi_gray, (5, 5), 0)
    _, thresh = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    # Clean up with morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    # Find the largest rectangular contour within the ROI.
    # The reading window should be the dominant bright rectangle.
    roi_h, roi_w = roi_gray.shape[:2]
    roi_area = roi_h * roi_w
    best_contour = None
    best_area = roi_area * 0.05  # minimum 5% of ROI

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < best_area or area > roi_area * 0.90:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
        if 4 <= len(approx) <= 8:
            rect = cv2.minAreaRect(cnt)
            rect_w, rect_h = rect[1]
            if rect_w * rect_h <= 0:
                continue
            fill = area / (rect_w * rect_h)
            if fill > 0.6 and area > best_area:
                best_contour = cnt
                best_area = area

    if best_contour is not None:
        # Crop to the bounding rectangle of the detected window
        x, y, bw, bh = cv2.boundingRect(best_contour)
        # Add small padding
        pad = 5
        x = max(0, x - pad)
        y = max(0, y - pad)
        bw = min(roi_w - x, bw + 2 * pad)
        bh = min(roi_h - y, bh + 2 * pad)
        window = roi_color[y:y + bh, x:x + bw]
        if window.size > 0:
            logger.debug("Reading window detected via contour detection")
            return window

    # Fallback: fixed-ratio crop based on typical cassette geometry.
    # The reading window is roughly at 30-75% width, 25-90% height
    # of the cassette.
    fx1 = int(w * 0.28)
    fx2 = int(w * 0.73)
    fy1 = int(h * 0.15)
    fy2 = int(h * 0.92)
    window = cassette_img[fy1:fy2, fx1:fx2]
    logger.debug("Reading window extracted via fixed-ratio fallback")
    return window


def _enhance_contrast(img: np.ndarray) -> np.ndarray:
    """Enhance brightness and contrast to make faint test lines more visible.

    Uses CLAHE (Contrast Limited Adaptive Histogram Equalization) on the
    L channel in LAB color space for local contrast enhancement without
    color distortion. Also normalizes brightness for dark images.

    Args:
        img: BGR image of the reading window.

    Returns:
        Enhanced BGR image with improved visibility of faint bands.
    """
    # Convert to LAB color space for perceptual brightness manipulation
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # Normalize brightness: if the image is dark, stretch the L channel
    l_mean = np.mean(l_channel)
    if l_mean < 140:
        # Scale L channel to bring mean brightness to ~160
        scale = min(160.0 / max(l_mean, 1.0), 2.0)
        l_channel = np.clip(l_channel * scale, 0, 255).astype(np.uint8)
        logger.debug(
            "Brightness normalized: mean %.1f -> %.1f (scale=%.2f)",
            l_mean, np.mean(l_channel), scale
        )

    # Apply CLAHE for local contrast enhancement.
    # clipLimit controls the contrast amplification threshold;
    # tileGridSize defines the local region size for equalization.
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)

    # Merge channels and convert back to BGR
    enhanced_lab = cv2.merge([l_channel, a_channel, b_channel])
    enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    return enhanced
