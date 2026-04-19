import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect as sa_inspect

from app.database import engine, Base
from app.config import UPLOAD_DIR, CORS_ORIGINS
from app.routers import users, upload, reading, stats

Base.metadata.create_all(bind=engine)
os.makedirs(UPLOAD_DIR, exist_ok=True)


# 历史迁移:为 images 表添加预处理相关字段(如尚不存在)。
# 老库可能没有这些列;新库 create_all 时已带,跳过即可。
def _migrate_images_preprocessing(eng):
    if "images" not in sa_inspect(eng).get_table_names():
        return
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
    if "images" not in sa_inspect(eng).get_table_names():
        return
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


def _migrate_drop_llm_fields(eng):
    if "images" not in sa_inspect(eng).get_table_names():
        return
    columns = [c["name"] for c in sa_inspect(eng).get_columns("images")]
    with eng.begin() as conn:
        if "reading_result" in columns:
            conn.execute(text("ALTER TABLE images DROP COLUMN reading_result"))
        if "reading_confidence" in columns:
            conn.execute(text("ALTER TABLE images DROP COLUMN reading_confidence"))


_migrate_drop_llm_fields(engine)


# Drop the upload_batches table and inline its fields onto images.
# Idempotent: detects whether the legacy table still exists and skips otherwise.
# Steps:
#   1. Add user_id / reading_status / reading_error columns to images (if missing).
#   2. Backfill those columns from upload_batches via the legacy batch_id link.
#   3. Migrate users.role 'batch' -> 'single'.
#   4. Rebuild images without batch_id (SQLite ALTER TABLE workaround) and
#      drop upload_batches.
def _migrate_drop_batch_model(eng):
    insp = sa_inspect(eng)
    table_names = set(insp.get_table_names())
    if "upload_batches" not in table_names:
        return  # already migrated or fresh DB

    print("[migrate] Dropping upload_batches model: started")

    # Step 1: add the new columns on images if they don't already exist
    images_cols = {c["name"] for c in insp.get_columns("images")}
    with eng.begin() as conn:
        if "user_id" not in images_cols:
            conn.execute(text("ALTER TABLE images ADD COLUMN user_id INTEGER"))
        if "reading_status" not in images_cols:
            conn.execute(text("ALTER TABLE images ADD COLUMN reading_status TEXT"))
        if "reading_error" not in images_cols:
            conn.execute(text("ALTER TABLE images ADD COLUMN reading_error TEXT"))

    # Step 2: backfill from upload_batches via the legacy batch_id link.
    # COALESCE preserves any value that may have been written under the new
    # schema while still picking up legacy data on first run.
    images_cols = {c["name"] for c in sa_inspect(eng).get_columns("images")}
    if "batch_id" in images_cols:
        with eng.begin() as conn:
            conn.execute(text(
                """
                UPDATE images SET
                    user_id = COALESCE(
                        user_id,
                        (SELECT user_id FROM upload_batches b WHERE b.id = images.batch_id)
                    ),
                    reading_status = COALESCE(
                        reading_status,
                        (SELECT reading_status FROM upload_batches b WHERE b.id = images.batch_id)
                    ),
                    reading_error = COALESCE(
                        reading_error,
                        (SELECT reading_error FROM upload_batches b WHERE b.id = images.batch_id)
                    )
                WHERE batch_id IS NOT NULL
                """
            ))

    # Step 3: collapse the 'batch' role into 'single'
    with eng.begin() as conn:
        conn.execute(text("UPDATE users SET role='single' WHERE role='batch'"))

    # Step 4: rebuild images without batch_id, then drop upload_batches.
    # SQLite cannot drop a column that participates in a FK constraint, so we
    # follow the standard "12-step" copy-via-new-table approach.
    with eng.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text(
            """
            CREATE TABLE images_new (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL UNIQUE,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                preprocessed_filename TEXT,
                preprocessed_path TEXT,
                is_preprocessed BOOLEAN DEFAULT 0 NOT NULL,
                cv_result TEXT,
                cv_confidence TEXT,
                manual_correction TEXT,
                reading_status TEXT,
                reading_error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        ))
        conn.execute(text(
            """
            INSERT INTO images_new (
                id, user_id, original_filename, stored_filename, file_path, file_size,
                preprocessed_filename, preprocessed_path, is_preprocessed,
                cv_result, cv_confidence, manual_correction,
                reading_status, reading_error, created_at
            )
            SELECT
                id, user_id, original_filename, stored_filename, file_path, file_size,
                preprocessed_filename, preprocessed_path, is_preprocessed,
                cv_result, cv_confidence, manual_correction,
                reading_status, reading_error, created_at
            FROM images
            """
        ))
        conn.execute(text("DROP TABLE images"))
        conn.execute(text("ALTER TABLE images_new RENAME TO images"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_images_id ON images (id)"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_images_stored_filename ON images (stored_filename)"
        ))
        conn.execute(text("DROP TABLE upload_batches"))
        conn.execute(text("PRAGMA foreign_keys=ON"))

    print("[migrate] Dropping upload_batches model: completed")


_migrate_drop_batch_model(engine)


# Adds the disease-workflow columns introduced with the three-disease expansion
# (FIV/FeLV, Tick Borne, Canine Urothelial Carcinoma). Idempotent:
#   - images.warnings: JSON string of warning keys computed server-side.
#   - patient_info.disease_category: required identifier of the chosen workflow.
#   - patient_info.preventive_treatment: only populated by the Tick Borne path.
#   - patient_info.zip_code -> patient_info.area_code: terminology alignment.
def _migrate_add_disease_fields(eng):
    insp = sa_inspect(eng)
    table_names = set(insp.get_table_names())

    if "images" in table_names:
        images_cols = {c["name"] for c in insp.get_columns("images")}
        with eng.begin() as conn:
            if "warnings" not in images_cols:
                conn.execute(text("ALTER TABLE images ADD COLUMN warnings TEXT"))

    if "patient_info" in table_names:
        patient_cols = {c["name"] for c in insp.get_columns("patient_info")}
        with eng.begin() as conn:
            if "disease_category" not in patient_cols:
                conn.execute(text(
                    "ALTER TABLE patient_info ADD COLUMN disease_category TEXT"
                ))
            if "preventive_treatment" not in patient_cols:
                conn.execute(text(
                    "ALTER TABLE patient_info ADD COLUMN preventive_treatment INTEGER"
                ))
            # Rename zip_code -> area_code; SQLite 3.25+ supports column rename.
            patient_cols = {
                c["name"] for c in sa_inspect(eng).get_columns("patient_info")
            }
            if "zip_code" in patient_cols and "area_code" not in patient_cols:
                conn.execute(text(
                    "ALTER TABLE patient_info RENAME COLUMN zip_code TO area_code"
                ))


_migrate_add_disease_fields(engine)


app = FastAPI(title="LFA Reader", version="0.2.0")

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


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
