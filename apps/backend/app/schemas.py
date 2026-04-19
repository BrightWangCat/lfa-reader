import json
import os
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# Single source of truth for disease / breed / age enums lives in shared/data/*.json,
# so web, backend and iOS all agree on the same set.
_SHARED_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "shared",
    "data",
)


def _load_shared_json(name: str):
    with open(os.path.join(_SHARED_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


_DISEASES = _load_shared_json("diseases.json")
_BREEDS = _load_shared_json("breeds.json")
_AGE_OPTIONS = _load_shared_json("age_options.json")

DISEASE_BY_ID = {d["id"]: d for d in _DISEASES}
DISEASE_LABELS = {d["label"] for d in _DISEASES}
VALID_SEX = {"M", "F", "CM", "CF"}


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str = "single"
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


class PatientInfoCreate(BaseModel):
    # disease_category uses the human-facing label (e.g. "FIV/FeLV") so it also
    # reads naturally when surfaced in stats and admin tooling.
    disease_category: str
    age: Optional[str] = None
    sex: Optional[str] = None
    breed: Optional[str] = None
    area_code: Optional[str] = None
    preventive_treatment: Optional[bool] = None

    @field_validator("disease_category")
    @classmethod
    def validate_disease(cls, v: str) -> str:
        if v not in DISEASE_LABELS:
            raise ValueError(
                f"disease_category must be one of: {sorted(DISEASE_LABELS)}"
            )
        return v

    @field_validator("sex")
    @classmethod
    def validate_sex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_SEX:
            raise ValueError(f"sex must be one of: {sorted(VALID_SEX)}")
        return v


class PatientInfoResponse(BaseModel):
    id: int
    disease_category: str
    species: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    breed: Optional[str] = None
    area_code: Optional[str] = None
    preventive_treatment: Optional[bool] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientSummary(BaseModel):
    total_with_patient_info: int
    species_distribution: dict
    sex_distribution: dict


class ImageResponse(BaseModel):
    """Detail view of an image, including patient info if present."""
    id: int
    user_id: int
    original_filename: str
    stored_filename: str
    file_size: int
    is_preprocessed: bool = False
    cv_result: str | None = None
    cv_confidence: str | None = None
    manual_correction: str | None = None
    reading_status: str | None = None
    reading_error: str | None = None
    warnings: list[str] = []
    patient_info: Optional[PatientInfoResponse] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("warnings", mode="before")
    @classmethod
    def _parse_warnings(cls, v):
        # Stored as JSON string on Image.warnings; unwrap for the API response.
        if v is None or v == "":
            return []
        if isinstance(v, list):
            return v
        try:
            parsed = json.loads(v)
        except (ValueError, TypeError):
            return []
        return parsed if isinstance(parsed, list) else []


class ImageListItem(BaseModel):
    """Compact list item for the History page."""
    id: int
    user_id: int
    original_filename: str
    cv_result: str | None = None
    manual_correction: str | None = None
    reading_status: str | None = None
    disease_category: str | None = None
    created_at: datetime
    username: str | None = None

    model_config = {"from_attributes": True}
