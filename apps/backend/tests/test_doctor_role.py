import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.auth import require_admin, require_clinical
from app.models import Base, User
from app.routers.users import (
    DoctorApplicationDecision,
    SetRoleRequest,
    decide_doctor_application,
    register,
    set_user_role,
)
from app.schemas import UserCreate, UserResponse
from app.role_utils import (
    ADMIN_ROLE,
    CLINICAL_ROLES,
    DOCTOR_ROLE,
    USER_ROLE,
    VALID_USER_ROLES,
    migrate_users_doctor_application,
)


def _make_user(role=USER_ROLE, suffix="1", doctor_application_status=None):
    return User(
        email=f"{role}{suffix}@example.com",
        username=f"{role}{suffix}",
        hashed_password="hashed",
        role=role,
        doctor_application_status=doctor_application_status,
    )


class DoctorRoleConstantTests(unittest.TestCase):
    def test_role_constants(self):
        self.assertEqual(VALID_USER_ROLES, (USER_ROLE, DOCTOR_ROLE, ADMIN_ROLE))
        self.assertEqual(CLINICAL_ROLES, (DOCTOR_ROLE, ADMIN_ROLE))

    def test_require_clinical_rejects_regular_user(self):
        with self.assertRaises(HTTPException) as ctx:
            require_clinical(current_user=_make_user(role=USER_ROLE))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_require_clinical_allows_doctor_and_admin(self):
        doctor = _make_user(role=DOCTOR_ROLE)
        admin = _make_user(role=ADMIN_ROLE)
        self.assertIs(require_clinical(current_user=doctor), doctor)
        self.assertIs(require_clinical(current_user=admin), admin)

    def test_require_admin_rejects_doctor(self):
        with self.assertRaises(HTTPException) as ctx:
            require_admin(current_user=_make_user(role=DOCTOR_ROLE))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_user_response_carries_application_status(self):
        user = _make_user(doctor_application_status="pending")
        user.id = 1
        from datetime import datetime, timezone

        user.created_at = datetime.now(timezone.utc)
        payload = UserResponse.model_validate(user)
        self.assertEqual(payload.doctor_application_status, "pending")

    def test_user_create_defaults_to_no_application(self):
        payload = UserCreate(
            email="plain@example.com", username="plain", password="pw",
        )
        self.assertFalse(payload.apply_doctor)


class DoctorApplicationFlowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )
        self.db = self.SessionLocal()
        self.admin = _make_user(role=ADMIN_ROLE, suffix="a")
        self.applicant = _make_user(
            role=USER_ROLE, suffix="b", doctor_application_status="pending",
        )
        self.db.add_all([self.admin, self.applicant])
        self.db.commit()
        self.db.refresh(self.admin)
        self.db.refresh(self.applicant)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_register_with_apply_doctor_creates_pending_user(self):
        created = register(
            UserCreate(
                email="vet@example.com",
                username="vet_applicant",
                password="pw",
                apply_doctor=True,
            ),
            db=self.db,
        )
        self.assertEqual(created.role, USER_ROLE)
        self.assertEqual(created.doctor_application_status, "pending")

    def test_register_without_application_stays_clean(self):
        created = register(
            UserCreate(
                email="plain2@example.com",
                username="plain2",
                password="pw",
            ),
            db=self.db,
        )
        self.assertEqual(created.role, USER_ROLE)
        self.assertIsNone(created.doctor_application_status)

    def test_approve_sets_doctor_role_and_clears_status(self):
        updated = decide_doctor_application(
            self.applicant.id,
            DoctorApplicationDecision(decision="approve"),
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual(updated.role, DOCTOR_ROLE)
        self.assertIsNone(updated.doctor_application_status)

    def test_reject_keeps_user_role_and_records_rejection(self):
        updated = decide_doctor_application(
            self.applicant.id,
            DoctorApplicationDecision(decision="reject"),
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual(updated.role, USER_ROLE)
        self.assertEqual(updated.doctor_application_status, "rejected")

    def test_decision_requires_pending_application(self):
        plain = _make_user(role=USER_ROLE, suffix="c")
        self.db.add(plain)
        self.db.commit()
        self.db.refresh(plain)

        with self.assertRaises(HTTPException) as ctx:
            decide_doctor_application(
                plain.id,
                DoctorApplicationDecision(decision="approve"),
                current_user=self.admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_invalid_decision_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            decide_doctor_application(
                self.applicant.id,
                DoctorApplicationDecision(decision="maybe"),
                current_user=self.admin,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.db.refresh(self.applicant)
        self.assertEqual(self.applicant.doctor_application_status, "pending")

    def test_set_user_role_accepts_doctor(self):
        target = _make_user(role=USER_ROLE, suffix="d")
        self.db.add(target)
        self.db.commit()
        self.db.refresh(target)

        updated = set_user_role(
            target.id,
            SetRoleRequest(role=DOCTOR_ROLE),
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual(updated.role, DOCTOR_ROLE)


class DoctorApplicationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )

    def tearDown(self):
        self.engine.dispose()

    def _column_names(self):
        with self.engine.begin() as conn:
            rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        return {row[1] for row in rows}

    def test_migration_adds_column_to_legacy_schema(self):
        # Simulate a database created before the split: no application column.
        with self.engine.begin() as conn:
            conn.execute(text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email TEXT NOT NULL,
                    username TEXT NOT NULL,
                    hashed_password TEXT NOT NULL,
                    role TEXT NOT NULL
                )
                """
            ))
            conn.execute(text(
                """
                INSERT INTO users (email, username, hashed_password, role)
                VALUES ('old@example.com', 'old_user', 'hashed', 'user')
                """
            ))

        self.assertNotIn("doctor_application_status", self._column_names())

        migrate_users_doctor_application(self.engine)
        self.assertIn("doctor_application_status", self._column_names())

        # Existing rows are untouched and read back as never-applied.
        with self.engine.begin() as conn:
            row = conn.execute(text(
                "SELECT username, role, doctor_application_status FROM users"
            )).fetchone()
        self.assertEqual((row[0], row[1], row[2]), ("old_user", "user", None))

    def test_migration_is_idempotent(self):
        Base.metadata.create_all(bind=self.engine)
        self.assertIn("doctor_application_status", self._column_names())

        # Running against an up-to-date schema must be a no-op, twice.
        migrate_users_doctor_application(self.engine)
        migrate_users_doctor_application(self.engine)
        self.assertIn("doctor_application_status", self._column_names())

    def test_migration_skips_when_users_table_missing(self):
        migrate_users_doctor_application(self.engine)
        with self.engine.begin() as conn:
            tables = conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )).fetchall()
        self.assertEqual(tables, [])


if __name__ == "__main__":
    unittest.main()
