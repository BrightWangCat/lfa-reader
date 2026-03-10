import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect as sa_inspect

from app.database import engine, Base
from app.config import UPLOAD_DIR, CORS_ORIGINS
from app.routers import users, upload, reading, stats, export

Base.metadata.create_all(bind=engine)
os.makedirs(UPLOAD_DIR, exist_ok=True)


# Lightweight migration: add claude_model column if it does not exist yet.
# Safe to call on every startup; idempotent.
def _migrate_db(eng):
    columns = [c["name"] for c in sa_inspect(eng).get_columns("upload_batches")]
    if "claude_model" not in columns:
        with eng.begin() as conn:
            conn.execute(text("ALTER TABLE upload_batches ADD COLUMN claude_model TEXT"))


_migrate_db(engine)


# 轻量级迁移: 为 images 表添加预处理相关的字段（如果尚不存在）
def _migrate_images_preprocessing(eng):
    columns = [c["name"] for c in sa_inspect(eng).get_columns("images")]
    with eng.begin() as conn:
        if "preprocessed_filename" not in columns:
            conn.execute(text(
                "ALTER TABLE images ADD COLUMN preprocessed_filename TEXT"
            ))
        if "preprocessed_path" not in columns:
            conn.execute(text(
                "ALTER TABLE images ADD COLUMN preprocessed_path TEXT"
            ))
        if "is_preprocessed" not in columns:
            conn.execute(text(
                "ALTER TABLE images ADD COLUMN is_preprocessed BOOLEAN DEFAULT 0 NOT NULL"
            ))


_migrate_images_preprocessing(engine)


def _migrate_images_cv_fields(eng):
    columns = [c["name"] for c in sa_inspect(eng).get_columns("images")]
    with eng.begin() as conn:
        if "cv_result" not in columns:
            conn.execute(text(
                "ALTER TABLE images ADD COLUMN cv_result TEXT"
            ))
        if "cv_confidence" not in columns:
            conn.execute(text(
                "ALTER TABLE images ADD COLUMN cv_confidence TEXT"
            ))


_migrate_images_cv_fields(engine)


# Drop deprecated LLM classification columns (reading_result, reading_confidence)
# from images table. These are no longer used after removing the LLM classifier.
def _migrate_drop_llm_fields(eng):
    columns = [c["name"] for c in sa_inspect(eng).get_columns("images")]
    with eng.begin() as conn:
        if "reading_result" in columns:
            conn.execute(text("ALTER TABLE images DROP COLUMN reading_result"))
        if "reading_confidence" in columns:
            conn.execute(text("ALTER TABLE images DROP COLUMN reading_confidence"))


_migrate_drop_llm_fields(engine)

app = FastAPI(title="FeLV/FIV LFA Reader", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(upload.router)
app.include_router(reading.router)
app.include_router(stats.router)
app.include_router(export.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
