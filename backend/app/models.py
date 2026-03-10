from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    # Role-based access: "single", "batch", "admin"
    role = Column(String, default="single", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=True)  # 用户可选的批次名称
    total_images = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reading_status = Column(String, nullable=True, default=None)
    claude_model = Column(String, nullable=True, default=None)
    reading_error = Column(String, nullable=True, default=None)

    user = relationship("User", backref="batches")
    images = relationship("Image", back_populates="batch", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("upload_batches.id"), nullable=False)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False, unique=True)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)  # bytes
    preprocessed_filename = Column(String, nullable=True)  # 预处理后图片的文件名
    preprocessed_path = Column(String, nullable=True)  # 预处理后图片的完整路径
    is_preprocessed = Column(Boolean, default=False, nullable=False)  # 是否已完成预处理
    reading_result = Column(String, nullable=True)  # AI (LLM) classification result
    reading_confidence = Column(String, nullable=True)  # AI (LLM) confidence level
    cv_result = Column(String, nullable=True)  # CV band detection classification result
    cv_confidence = Column(String, nullable=True)  # CV band detection confidence level
    manual_correction = Column(String, nullable=True)  # Manual correction by user
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("UploadBatch", back_populates="images")
    patient_info = relationship(
        "PatientInfo", back_populates="image", uselist=False,
        cascade="all, delete-orphan",
    )


class PatientInfo(Base):
    __tablename__ = "patient_info"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey("images.id"), unique=True, nullable=False)
    species = Column(String, nullable=True)
    age = Column(String, nullable=True)
    sex = Column(String, nullable=True)
    breed = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    image = relationship("Image", back_populates="patient_info")
