import unittest

import cv2
import numpy as np

from app.services.classifiers.tick_borne import (
    ANALYTE_NAMES,
    SpotScore,
    classify_from_spot_scores,
    score_spot,
)


class TickBorneClassifierTests(unittest.TestCase):
    def test_score_spot_detects_colored_circle_against_background(self):
        img = np.full((120, 120, 3), 220, dtype=np.uint8)
        cv2.circle(img, (60, 60), 14, (190, 180, 80), -1)

        score = score_spot(img, "control", (60, 60), 14, threshold=7.0)

        self.assertTrue(score.detected)
        self.assertGreater(score.score, score.threshold)
        self.assertGreater(score.high_chroma_ratio, 0.08)

    def test_score_spot_rejects_plain_background(self):
        img = np.full((120, 120, 3), 220, dtype=np.uint8)

        score = score_spot(img, "control", (60, 60), 14, threshold=7.0)

        self.assertFalse(score.detected)
        self.assertLess(score.score, score.threshold)

    def test_classification_is_invalid_without_control(self):
        scores = {
            "control": SpotScore("control", False, 0.0, 7.0, 0.0, (20, 20)),
            "ehrlichia": SpotScore("ehrlichia", True, 12.0, 6.0, 0.2, (20, 50)),
            "lyme": SpotScore("lyme", False, 0.0, 6.0, 0.0, (30, 80)),
            "anaplasma": SpotScore("anaplasma", False, 0.0, 6.0, 0.0, (70, 40)),
            "heartworm": SpotScore("heartworm", False, 0.0, 6.0, 0.0, (70, 60)),
        }

        result = classify_from_spot_scores(scores)

        self.assertEqual(result["summary"], "Invalid")
        self.assertEqual(result["detail"]["overall"], "Invalid")
        self.assertEqual(result["detail"]["control"], "Invalid")

    def test_classification_is_negative_when_only_control_passes(self):
        scores = {
            "control": SpotScore("control", True, 16.0, 7.0, 0.2, (20, 20)),
            **{
                name: SpotScore(name, False, 1.0, 6.0, 0.0, (0, 0))
                for name in ANALYTE_NAMES
            },
        }

        result = classify_from_spot_scores(scores)

        self.assertEqual(result["summary"], "Negative")
        self.assertEqual(result["detail"]["overall"], "Negative")
        self.assertTrue(
            all(v == "Negative" for v in result["detail"]["analytes"].values())
        )

    def test_classification_summarizes_multiple_positive_analytes(self):
        scores = {
            "control": SpotScore("control", True, 18.0, 7.0, 0.2, (20, 20)),
            "ehrlichia": SpotScore("ehrlichia", True, 12.0, 6.0, 0.2, (20, 50)),
            "lyme": SpotScore("lyme", False, 1.0, 6.0, 0.0, (30, 80)),
            "anaplasma": SpotScore("anaplasma", False, 1.0, 6.0, 0.0, (70, 40)),
            "heartworm": SpotScore("heartworm", True, 10.0, 6.0, 0.2, (70, 60)),
        }

        result = classify_from_spot_scores(scores)

        self.assertEqual(result["summary"], "Positive: Ehrlichia, Heartworm")
        self.assertEqual(result["confidence"], "medium")
        self.assertEqual(result["detail"]["overall"], "Positive")
        self.assertEqual(result["detail"]["analytes"]["ehrlichia"], "Positive")
        self.assertEqual(result["detail"]["analytes"]["heartworm"], "Positive")


if __name__ == "__main__":
    unittest.main()
