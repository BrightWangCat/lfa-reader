import unittest

from app.routers.reading import is_valid_manual_correction
from app.services.weekly_trends import is_positive_result, normalize_result_category


class ReadingCategoryTests(unittest.TestCase):
    def test_manual_correction_accepts_existing_categories(self):
        self.assertTrue(is_valid_manual_correction("Negative"))
        self.assertTrue(is_valid_manual_correction("Positive L+I"))
        self.assertTrue(is_valid_manual_correction("Invalid"))

    def test_manual_correction_accepts_tick_borne_positive_summary(self):
        self.assertTrue(is_valid_manual_correction("Positive: E. canis/E. ewingii Ab"))
        self.assertTrue(is_valid_manual_correction("Positive: E. canis/E. ewingii Ab, Heartworm Ag"))

    def test_manual_correction_rejects_unknown_tick_borne_analyte(self):
        self.assertFalse(is_valid_manual_correction("Positive: Unknown"))
        self.assertFalse(is_valid_manual_correction("Positive:"))

    def test_positive_result_helper_accepts_tick_borne_summary(self):
        self.assertTrue(is_positive_result("Positive L"))
        self.assertTrue(is_positive_result("Positive: Lyme disease Ab (B. burgdorferi)"))
        self.assertFalse(is_positive_result("Negative"))
        self.assertFalse(is_positive_result("Invalid"))

    def test_normalize_result_category_maps_tick_borne_positive_to_positive(self):
        self.assertEqual(normalize_result_category("Positive: Lyme disease Ab (B. burgdorferi)"), "Positive")
        self.assertEqual(normalize_result_category("Positive I"), "Positive I")
        self.assertEqual(normalize_result_category("Invalid"), "Invalid")


if __name__ == "__main__":
    unittest.main()
