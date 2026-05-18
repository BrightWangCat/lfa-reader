import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.classification_dispatcher import (
    classify_image_record,
    preprocess_image_for_workflow,
)


class ClassificationDispatcherTests(unittest.TestCase):
    def test_routes_tick_borne_to_tick_borne_classifier(self):
        image = SimpleNamespace(
            file_path="/tmp/tick.jpg",
            patient_info=SimpleNamespace(disease_category="Tick Borne"),
        )

        with patch(
            "app.services.classification_dispatcher.tick_borne.classify_single_image",
            return_value=(
                "Positive: Lyme",
                "medium",
                {"workflow": "Tick Borne"},
            ),
        ) as classifier:
            result = classify_image_record(image)

        classifier.assert_called_once_with("/tmp/tick.jpg")
        self.assertEqual(result.summary, "Positive: Lyme")
        self.assertEqual(result.confidence, "medium")
        self.assertEqual(result.detail["workflow"], "Tick Borne")

    def test_routes_fiv_felv_to_fiv_felv_classifier(self):
        image = SimpleNamespace(
            file_path="/tmp/fiv.jpg",
            patient_info=SimpleNamespace(disease_category="FIV/FeLV"),
        )

        with patch(
            "app.services.classification_dispatcher.fiv_felv.classify_single_image",
            return_value=("Negative", "high", {"workflow": "FIV/FeLV"}),
        ) as classifier:
            result = classify_image_record(image)

        classifier.assert_called_once_with("/tmp/fiv.jpg")
        self.assertEqual(result.summary, "Negative")
        self.assertEqual(result.confidence, "high")
        self.assertEqual(result.detail["workflow"], "FIV/FeLV")

    def test_missing_patient_info_defaults_to_fiv_felv_classifier(self):
        image = SimpleNamespace(file_path="/tmp/legacy.jpg", patient_info=None)

        with patch(
            "app.services.classification_dispatcher.fiv_felv.classify_single_image",
            return_value=("Invalid", "low", {"workflow": "FIV/FeLV"}),
        ) as classifier:
            result = classify_image_record(image)

        classifier.assert_called_once_with("/tmp/legacy.jpg")
        self.assertEqual(result.summary, "Invalid")

    def test_preprocess_routes_tick_borne_to_tick_borne_preprocessor(self):
        with patch(
            "app.services.classification_dispatcher.tick_borne.preprocess_cassette_image",
        ) as preprocessor:
            preprocess_image_for_workflow("/tmp/in.jpg", "/tmp/out.jpg", "Tick Borne")

        preprocessor.assert_called_once_with("/tmp/in.jpg", "/tmp/out.jpg")

    def test_preprocess_routes_other_workflows_to_fiv_felv_preprocessor(self):
        with patch(
            "app.services.classification_dispatcher.fiv_felv.preprocess_cassette_image",
        ) as preprocessor:
            preprocess_image_for_workflow("/tmp/in.jpg", "/tmp/out.jpg", "FIV/FeLV")

        preprocessor.assert_called_once_with("/tmp/in.jpg", "/tmp/out.jpg")


if __name__ == "__main__":
    unittest.main()
