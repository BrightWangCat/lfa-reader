import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ClassificationResult:
    summary: str
    confidence: str
    detail: dict[str, Any] | None = None


def encode_detail(detail: dict[str, Any] | None) -> str | None:
    """Serialize structured classifier output for SQLite storage."""
    if detail is None:
        return None
    return json.dumps(detail, separators=(",", ":"), sort_keys=True)


def confidence_from_ratios(ratios: list[float]) -> str:
    """Map score/threshold ratios to the existing confidence labels."""
    if not ratios:
        return "low"
    weakest = min(ratios)
    if weakest >= 2.5:
        return "high"
    if weakest >= 1.5:
        return "medium"
    return "low"
