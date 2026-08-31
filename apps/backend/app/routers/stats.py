from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import User, Image
from app.auth import get_current_user, require_clinical
from app.schemas import DISEASE_LABELS
from app.services.result_categories import (
    STAT_CATEGORIES,
    is_positive_result,
    normalize_result_category,
)
from app.services.weekly_trends import build_weekly_trends

router = APIRouter(prefix="/api/stats", tags=["stats"])

# PatientInfo dimensions surfaced on the Statistics page.
PATIENT_DIMENSIONS = [
    "disease_category",
    "species",
    "age",
    "sex",
    "breed",
    "area_code",
    "preventive_treatment",
]


@router.get("/global")
def get_global_stats(
    disease_category: Optional[str] = Query(
        None, description="Optional filter; must match a label in shared/data/diseases.json"
    ),
    current_user: User = Depends(require_clinical),
    db: Session = Depends(get_db),
):
    """
    Global statistics across all users' test results. Clinical roles only;
    regular users get the map-only view from /stats/map instead.
    Only includes images that have patient_info and a valid classification
    (Negative, Positive L, Positive I, Positive L+I).
    For each patient info dimension, returns distribution per classification category.
    Optional disease_category filter narrows the result to one workflow.
    """
    if disease_category is not None and disease_category not in DISEASE_LABELS:
        # Treat unknown filters as "no matches" rather than 400 so the UI can
        # keep showing an empty chart without an error banner.
        disease_category = "__unknown__"

    images = (
        db.query(Image)
        .options(joinedload(Image.patient_info))
        .filter(Image.patient_info.has())
        .all()
    )

    categorized = []
    weekly_records = []
    for img in images:
        pi = img.patient_info
        if disease_category is not None and pi.disease_category != disease_category:
            continue
        final = img.manual_correction or img.cv_result
        normalized = normalize_result_category(final)
        if normalized in STAT_CATEGORIES:
            categorized.append((normalized, pi))
            weekly_records.append((final, img.created_at))

    weekly_trends, temperature_error = build_weekly_trends(weekly_records)

    total = len(categorized)
    if total == 0:
        return {
            "total": 0,
            "category_totals": {cat: 0 for cat in STAT_CATEGORIES},
            "dimensions": {
                dim: {cat: {} for cat in STAT_CATEGORIES}
                for dim in PATIENT_DIMENSIONS
            },
            "weekly_trends": weekly_trends,
            "temperature_error": temperature_error,
        }

    category_totals = {cat: 0 for cat in STAT_CATEGORIES}
    for final, _ in categorized:
        category_totals[final] += 1

    dimensions = {}
    for dim in PATIENT_DIMENSIONS:
        dimensions[dim] = {cat: {} for cat in STAT_CATEGORIES}
        for final, pi in categorized:
            value = getattr(pi, dim, None)
            if value is None:
                continue
            # Normalize boolean flags to human-readable labels so the chart
            # legend stays meaningful without frontend bookkeeping.
            if isinstance(value, bool):
                value = "Yes" if value else "No"
            if value == "":
                continue
            dist = dimensions[dim][final]
            dist[value] = dist.get(value, 0) + 1

    return {
        "total": total,
        "category_totals": category_totals,
        "dimensions": dimensions,
        "weekly_trends": weekly_trends,
        "temperature_error": temperature_error,
    }


@router.get("/map")
def get_map_stats(
    disease_category: Optional[str] = Query(
        None, description="Optional filter; must match a label in shared/data/diseases.json"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Positive-case counts per area code for the ZIP map.
    Open to every signed-in role: it exposes only aggregated positive counts
    keyed by area code, never individual readings. The full statistics stay
    clinical-only on /stats/global.
    """
    if disease_category is not None and disease_category not in DISEASE_LABELS:
        # Same convention as /global: unknown filters mean "no matches".
        disease_category = "__unknown__"

    images = (
        db.query(Image)
        .options(joinedload(Image.patient_info))
        .filter(Image.patient_info.has())
        .all()
    )

    positive_by_area_code: dict[str, int] = {}
    total_positive = 0
    for img in images:
        pi = img.patient_info
        if disease_category is not None and pi.disease_category != disease_category:
            continue
        final = img.manual_correction or img.cv_result
        if not is_positive_result(final):
            continue
        total_positive += 1
        if not pi.area_code:
            continue
        positive_by_area_code[pi.area_code] = (
            positive_by_area_code.get(pi.area_code, 0) + 1
        )

    return {
        "total_positive": total_positive,
        "positive_by_area_code": positive_by_area_code,
    }
