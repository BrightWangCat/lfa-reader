import unittest
from datetime import date, datetime, timezone

from app.services.weekly_trends import (
    POSITIVE_TREND_CATEGORIES,
    aggregate_weekly_counts,
    build_weekly_trends,
    build_week_windows,
    combine_weekly_trends,
)


class WeeklyTrendTests(unittest.TestCase):
    def test_build_week_windows_includes_current_sunday_week(self):
        windows = build_week_windows(today=date(2026, 5, 18), week_count=3)

        self.assertEqual(windows[0]["week_start"], "2026-05-03")
        self.assertEqual(windows[1]["week_start"], "2026-05-10")
        self.assertEqual(windows[2]["week_start"], "2026-05-17")
        self.assertEqual(windows[2]["week_end"], "2026-05-23")

    def test_aggregate_weekly_counts_keeps_categories_separate_and_zero_filled(self):
        windows = build_week_windows(today=date(2026, 5, 18), week_count=2)
        records = [
            ("Positive L", datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)),
            ("Positive I", datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)),
            ("Positive L+I", datetime(2026, 5, 17, 12, 0, tzinfo=timezone.utc)),
            ("Positive: Lyme disease Ab (B. burgdorferi)", datetime(2026, 5, 17, 13, 0, tzinfo=timezone.utc)),
            ("Negative", datetime(2026, 5, 17, 12, 0, tzinfo=timezone.utc)),
        ]

        counts = aggregate_weekly_counts(records, windows)

        self.assertEqual(
            counts[0],
            {"Positive": 0, "Positive L": 1, "Positive I": 1, "Positive L+I": 0},
        )
        self.assertEqual(
            counts[1],
            {"Positive": 1, "Positive L": 0, "Positive I": 0, "Positive L+I": 1},
        )

    def test_combine_weekly_trends_averages_temperature_by_week(self):
        windows = build_week_windows(today=date(2026, 5, 18), week_count=1)
        counts = [{category: 0 for category in POSITIVE_TREND_CATEGORIES}]
        temperatures = {
            date(2026, 5, 17): 50.0,
            date(2026, 5, 18): 54.0,
        }

        trends = combine_weekly_trends(windows, counts, temperatures)

        self.assertEqual(trends[0]["label"], "May 17")
        self.assertEqual(trends[0]["avg_temperature_f"], 52.0)

    def test_build_weekly_trends_fetches_temperature_only_through_today(self):
        requested_ranges = []

        def fake_fetcher(start_date, end_date):
            requested_ranges.append((start_date, end_date))
            return {}

        build_weekly_trends([], temperature_fetcher=fake_fetcher, today=date(2026, 5, 18))

        self.assertEqual(requested_ranges[0][1], date(2026, 5, 18))


if __name__ == "__main__":
    unittest.main()
