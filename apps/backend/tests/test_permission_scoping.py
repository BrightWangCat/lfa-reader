import os
import tempfile
import unittest

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, User, Image
from app.routers.upload import (
    delete_image,
    get_image_detail,
    get_image_file,
    list_images,
)
from app.routers.reading import ManualCorrectionRequest, correct_reading
from app.role_utils import ADMIN_ROLE, DOCTOR_ROLE, USER_ROLE


class PermissionScopingTests(unittest.TestCase):
    """Permission matrix for record access: user sees own, clinical sees all,
    deleting someone else's record stays admin-only."""

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

        self.owner = self._add_user("owner", USER_ROLE)
        self.other = self._add_user("other", USER_ROLE)
        self.doctor = self._add_user("doctor", DOCTOR_ROLE)
        self.admin = self._add_user("admin", ADMIN_ROLE)

        self.tmpdir = tempfile.TemporaryDirectory()
        self.owner_image = self._add_image(self.owner, "owner.jpg")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.tmpdir.cleanup()

    def _add_user(self, name, role):
        user = User(
            email=f"{name}@example.com",
            username=name,
            hashed_password="hashed",
            role=role,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def _add_image(self, user, filename):
        file_path = os.path.join(self.tmpdir.name, filename)
        with open(file_path, "wb") as out:
            out.write(b"stub")
        image = Image(
            user_id=user.id,
            original_filename=filename,
            stored_filename=f"stored_{filename}",
            file_path=file_path,
            file_size=4,
            is_preprocessed=False,
            disease_category="FIV/FeLV",
            cv_result="Negative",
        )
        self.db.add(image)
        self.db.commit()
        self.db.refresh(image)
        return image

    # ---- history list ----

    def test_regular_user_lists_only_own_images(self):
        self._add_image(self.other, "other.jpg")
        items = list_images(current_user=self.owner, db=self.db)
        self.assertEqual([item.user_id for item in items], [self.owner.id])

    def test_doctor_lists_all_images_with_usernames(self):
        self._add_image(self.other, "other.jpg")
        items = list_images(current_user=self.doctor, db=self.db)
        self.assertEqual(len(items), 2)
        self.assertEqual(
            {item.username for item in items}, {"owner", "other"},
        )

    # ---- record detail ----

    def test_regular_user_cannot_read_others_detail(self):
        with self.assertRaises(HTTPException) as ctx:
            get_image_detail(
                self.owner_image.id, current_user=self.other, db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_doctor_reads_any_detail(self):
        image = get_image_detail(
            self.owner_image.id, current_user=self.doctor, db=self.db,
        )
        self.assertEqual(image.id, self.owner_image.id)

    # ---- image file ----

    def test_regular_user_cannot_fetch_others_file(self):
        with self.assertRaises(HTTPException) as ctx:
            get_image_file(
                self.owner_image.id,
                original=False,
                current_user=self.other,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_doctor_fetches_any_file(self):
        response = get_image_file(
            self.owner_image.id,
            original=False,
            current_user=self.doctor,
            db=self.db,
        )
        self.assertIsInstance(response, FileResponse)

    # ---- deletion stays owner-or-admin ----

    def test_doctor_cannot_delete_others_image(self):
        with self.assertRaises(HTTPException) as ctx:
            delete_image(
                self.owner_image.id, current_user=self.doctor, db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_admin_deletes_any_image(self):
        delete_image(self.owner_image.id, current_user=self.admin, db=self.db)
        self.assertIsNone(
            self.db.query(Image).filter(Image.id == self.owner_image.id).first()
        )

    # ---- manual correction ----

    def test_owner_corrects_own_reading(self):
        result = correct_reading(
            self.owner_image.id,
            ManualCorrectionRequest(manual_correction="Positive L"),
            current_user=self.owner,
            db=self.db,
        )
        self.assertEqual(result["manual_correction"], "Positive L")

    def test_regular_user_cannot_correct_others_reading(self):
        with self.assertRaises(HTTPException) as ctx:
            correct_reading(
                self.owner_image.id,
                ManualCorrectionRequest(manual_correction="Positive L"),
                current_user=self.other,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_doctor_corrects_any_reading(self):
        result = correct_reading(
            self.owner_image.id,
            ManualCorrectionRequest(manual_correction="Invalid"),
            current_user=self.doctor,
            db=self.db,
        )
        self.assertEqual(result["manual_correction"], "Invalid")


if __name__ == "__main__":
    unittest.main()
