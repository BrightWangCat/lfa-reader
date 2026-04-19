from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import User, Image
from app.auth import get_current_user
from app.schemas import DISEASE_LABELS

router = APIRouter(prefix="/api/stats", tags=["stats"])

# Valid classifications included in stats (Invalid is intentionally excluded
# because it means the reader did not produce a diagnostic answer).
STAT_CATEGORIES = [
    "Negative",
    "Positive L",
    "Positive I",
    "Positive L+I",
]

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Global statistics across all users' test results.
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
    for img in images:
        pi = img.patient_info
        if disease_category is not None and pi.disease_category != disease_category:
            continue
        final = img.manual_correction or img.cv_result
        if final in STAT_CATEGORIES:
            categorized.append((final, pi))

    total = len(categorized)
    if total == 0:
        return {
            "total": 0,
            "category_totals": {cat: 0 for cat in STAT_CATEGORIES},
            "dimensions": {
                dim: {cat: {} for cat in STAT_CATEGORIES}
                for dim in PATIENT_DIMENSIONS
            },
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
    }
