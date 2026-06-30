FIV_FELV_CATEGORIES = [
    "Negative",
    "Positive L",
    "Positive I",
    "Positive L+I",
    "Invalid",
]

TICK_BORNE_ANALYTE_LABELS = [
    "E. canis/E. ewingii Ab",
    "Lyme disease Ab (B. burgdorferi)",
    "A. phagocytophilum/A. platys Ab",
    "Heartworm Ag",
]

STAT_CATEGORIES = [
    "Negative",
    "Positive",
    "Positive L",
    "Positive I",
    "Positive L+I",
]

POSITIVE_TREND_CATEGORIES = [
    "Positive",
    "Positive L",
    "Positive I",
    "Positive L+I",
]


def parse_tick_borne_positive_summary(result: str | None) -> list[str] | None:
    """Return analyte labels from 'Positive: ...' summaries."""
    if not result or not result.startswith("Positive:"):
        return None
    raw = result.removeprefix("Positive:").strip()
    if not raw:
        return None
    labels = [item.strip() for item in raw.split(",") if item.strip()]
    if not labels:
        return None
    allowed = set(TICK_BORNE_ANALYTE_LABELS)
    if any(label not in allowed for label in labels):
        return None
    if len(set(labels)) != len(labels):
        return None
    return labels


def is_tick_borne_positive_summary(result: str | None) -> bool:
    return parse_tick_borne_positive_summary(result) is not None


def normalize_result_category(result: str | None) -> str | None:
    """Map workflow-specific summaries into aggregate result categories."""
    if result in FIV_FELV_CATEGORIES:
        return result
    if is_tick_borne_positive_summary(result):
        return "Positive"
    return result


def is_positive_result(result: str | None) -> bool:
    category = normalize_result_category(result)
    return category in POSITIVE_TREND_CATEGORIES


def is_valid_manual_correction(result: str | None) -> bool:
    if result in FIV_FELV_CATEGORIES:
        return True
    return is_tick_borne_positive_summary(result)
