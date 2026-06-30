import json
import unittest
from datetime import datetime, timezone

from app.schemas import ImageResponse


class ResultDetailSchemaTests(unittest.TestCase):
    def test_image_response_parses_cv_result_detail_json(self):
        detail = {
            "workflow": "Tick Borne",
            "overall": "Positive",
            "control": "Valid",
            "analytes": {
                "ehrlichia": "Positive",
                "lyme": "Negative",
                "anaplasma": "Negative",
                "heartworm": "Positive",
            },
            "confidence": "medium",
        }

        response = ImageResponse.model_validate({
            "id": 1,
            "user_id": 1,
            "original_filename": "tick.jpg",
            "stored_filename": "tick.jpg",
            "file_size": 1234,
            "is_preprocessed": True,
            "cv_result": "Positive: E. canis/E. ewingii Ab, Heartworm Ag",
            "cv_confidence": "medium",
            "manual_correction": None,
            "reading_status": "completed",
            "reading_error": None,
            "warnings": "[]",
            "cv_result_detail": json.dumps(detail),
            "manual_correction_detail": None,
            "patient_info": None,
            "created_at": datetime(2026, 5, 18, tzinfo=timezone.utc),
        })

        self.assertEqual(response.cv_result_detail["workflow"], "Tick Borne")
        self.assertEqual(
            response.cv_result_detail["analytes"]["heartworm"],
            "Positive",
        )

    def test_image_response_parses_manual_correction_detail_json(self):
        correction = {
            "workflow": "Tick Borne",
            "overall": "Negative",
            "control": "Valid",
            "analytes": {
                "ehrlichia": "Negative",
                "lyme": "Negative",
                "anaplasma": "Negative",
                "heartworm": "Negative",
            },
        }

        response = ImageResponse.model_validate({
            "id": 2,
            "user_id": 1,
            "original_filename": "tick.jpg",
            "stored_filename": "tick.jpg",
            "file_size": 1234,
            "is_preprocessed": True,
            "cv_result": "Positive: Lyme disease Ab (B. burgdorferi)",
            "cv_confidence": "low",
            "manual_correction": "Negative",
            "reading_status": "completed",
            "reading_error": None,
            "warnings": [],
            "cv_result_detail": None,
            "manual_correction_detail": json.dumps(correction),
            "patient_info": None,
            "created_at": datetime(2026, 5, 18, tzinfo=timezone.utc),
        })

        self.assertEqual(response.manual_correction_detail["overall"], "Negative")
        self.assertEqual(response.manual_correction_detail["control"], "Valid")


if __name__ == "__main__":
    unittest.main()
