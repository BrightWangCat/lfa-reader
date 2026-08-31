import inspect
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_current_user, require_clinical
from app.models import Base, User, Image, PatientInfo
from app.routers.stats import get_global_stats, get_map_stats
from app.role_utils import USER_ROLE


def _dependency_functions(endpoint):
    """Collect the functions wired through Depends() defaults."""
    params = inspect.signature(endpoint).parameters
    return [
        getattr(p.default, "dependency", None)
        for p in params.values()
    ]


class StatsWiringTests(unittest.TestCase):
    def test_global_stats_requires_clinical_role(self):
        self.assertIn(require_clinical, _dependency_functions(get_global_stats))

    def test_map_stats_is_open_to_all_signed_in_roles(self):
        deps = _dependency_functions(get_map_stats)
        self.assertIn(get_current_user, deps)
        self.assertNotIn(require_clinical, deps)


class MapStatsTests(unittest.TestCase):
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
        self.user = User(
            email="user@example.com",
            username="user",
            hashed_password="hashed",
            role=USER_ROLE,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        # A positive FIV/FeLV case in 43210.
        self._add_reading(
            "a.jpg", "FIV/FeLV", cv_result="Positive L", area_code="43210",
        )
        # A positive Tick Borne summary in 43210.
        self._add_reading(
            "b.jpg", "Tick Borne",
            cv_result="Positive: Heartworm Ag", area_code="43210",
        )
        # Manual correction to Negative wins over the CV positive.
        self._add_reading(
            "c.jpg", "FIV/FeLV",
            cv_result="Positive I", manual_correction="Negative",
            area_code="43211",
        )
        # Positive without an area code counts toward the total only.
        self._add_reading(
            "d.jpg", "FIV/FeLV", cv_result="Positive I", area_code=None,
        )
        # Invalid results never count as positive.
        self._add_reading(
            "e.jpg", "FIV/FeLV", cv_result="Invalid", area_code="43210",
        )

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _add_reading(
        self, filename, disease, cv_result=None,
        manual_correction=None, area_code=None,
    ):
        image = Image(
            user_id=self.user.id,
            original_filename=filename,
            stored_filename=f"stored_{filename}",
            file_path=f"/tmp/{filename}",
            file_size=4,
            is_preprocessed=False,
            disease_category=disease,
            cv_result=cv_result,
            manual_correction=manual_correction,
        )
        self.db.add(image)
        self.db.flush()
        self.db.add(PatientInfo(
            image_id=image.id,
            disease_category=disease,
            area_code=area_code,
        ))
        self.db.commit()

    def test_counts_only_positive_finals_by_area_code(self):
        result = get_map_stats(
            disease_category=None, current_user=self.user, db=self.db,
        )
        self.assertEqual(result["total_positive"], 3)
        self.assertEqual(result["positive_by_area_code"], {"43210": 2})

    def test_disease_filter_narrows_to_one_workflow(self):
        result = get_map_stats(
            disease_category="FIV/FeLV", current_user=self.user, db=self.db,
        )
        self.assertEqual(result["total_positive"], 2)
        self.assertEqual(result["positive_by_area_code"], {"43210": 1})

    def test_unknown_disease_filter_returns_empty(self):
        result = get_map_stats(
            disease_category="No Such Workflow",
            current_user=self.user,
            db=self.db,
        )
        self.assertEqual(result["total_positive"], 0)
        self.assertEqual(result["positive_by_area_code"], {})


if __name__ == "__main__":
    unittest.main()
