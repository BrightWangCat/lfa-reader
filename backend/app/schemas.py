from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


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


class ImageResponse(BaseModel):
    id: int
    batch_id: int
    original_filename: str
    stored_filename: str
    file_size: int
    is_preprocessed: bool = False
    reading_result: str | None
    reading_confidence: str | None
    cv_result: str | None = None
    cv_confidence: str | None = None
    manual_correction: str | None
    patient_info: Optional["PatientInfoResponse"] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BatchResponse(BaseModel):
    id: int
    user_id: int
    name: str | None
    total_images: int
    created_at: datetime
    reading_status: str | None = None
    claude_model: str | None = None
    reading_error: str | None = None
    images: list[ImageResponse] = []

    model_config = {"from_attributes": True}


class PatientInfoCreate(BaseModel):
    species: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    breed: Optional[str] = None
    zip_code: Optional[str] = None

    @field_validator("sex")
    @classmethod
    def validate_sex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("M", "F", "CM", "SF"):
            raise ValueError("sex must be one of: M, F, CM, SF")
        return v

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if v == "":
                raise ValueError("age cannot be an empty string")
            if len(v) > 50:
                raise ValueError("age must be 50 characters or fewer")
        return v


class PatientInfoResponse(BaseModel):
    id: int
    species: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    breed: Optional[str] = None
    zip_code: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientSummary(BaseModel):
    total_with_patient_info: int
    species_distribution: dict
    sex_distribution: dict


class BatchListResponse(BaseModel):
    id: int
    user_id: int
    name: str | None
    total_images: int
    created_at: datetime
    username: str | None = None
    reading_status: str | None = None

    model_config = {"from_attributes": True}
