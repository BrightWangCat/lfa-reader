# Weekly Positive Temperature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Web and iOS statistics chart showing the latest 12 Sunday-Saturday weeks of separate positive result counts with Columbus, Ohio average temperature in Fahrenheit.

**Architecture:** Keep aggregation in the backend by extending `GET /api/stats/global` with `weekly_trends` and `temperature_error`. Implement pure weekly bucketing and weather aggregation helpers with unit tests, then render the returned contract in React and SwiftUI.

**Tech Stack:** FastAPI, SQLAlchemy, Python standard library `unittest`, Open-Meteo Historical Weather API via `urllib`, React 19, Ant Design Charts, SwiftUI, Swift Charts.

---

### Task 1: Backend Weekly Trend Helpers

**Files:**
- Create: `apps/backend/app/services/weekly_trends.py`
- Create: `apps/backend/tests/test_weekly_trends.py`
- Modify: `apps/backend/app/routers/stats.py`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/tests/test_weekly_trends.py` with tests for:

```python
import unittest
from datetime import date, datetime, timezone

from app.services.weekly_trends import (
    POSITIVE_TREND_CATEGORIES,
    aggregate_weekly_counts,
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
            ("Negative", datetime(2026, 5, 17, 12, 0, tzinfo=timezone.utc)),
        ]
        counts = aggregate_weekly_counts(records, windows)
        self.assertEqual(counts[0], {"Positive L": 1, "Positive I": 1, "Positive L+I": 0})
        self.assertEqual(counts[1], {"Positive L": 0, "Positive I": 0, "Positive L+I": 1})

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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_weekly_trends -v
```

Expected: fail because `app.services.weekly_trends` does not exist.

- [ ] **Step 3: Implement helper module**

Create `weekly_trends.py` with:

- `POSITIVE_TREND_CATEGORIES`
- `build_week_windows(today, week_count=12)`
- `aggregate_weekly_counts(records, windows)`
- `fetch_columbus_daily_mean_temperatures(start_date, end_date)`
- `combine_weekly_trends(windows, weekly_counts, daily_temperatures)`

Use `America/New_York` for date bucketing. Treat naive datetimes as UTC because SQLite `CURRENT_TIMESTAMP` is UTC-like in this app.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_weekly_trends -v
```

Expected: pass.

- [ ] **Step 5: Wire endpoint**

Modify `apps/backend/app/routers/stats.py` so both non-empty and empty responses include:

- `weekly_trends`
- `temperature_error`

The endpoint should catch weather fetch exceptions and return a generic temperature error without failing the stats response.

### Task 2: Web Chart

**Files:**
- Modify: `apps/web/src/pages/Statistics.jsx`

- [ ] **Step 1: Import chart type**

Import `DualAxes` from `@ant-design/charts`.

- [ ] **Step 2: Render chart section**

Add `WeeklyTrendChart` below the summary cards and above dimension sections. Convert backend `weekly_trends` into column rows for the three positive categories and line rows for non-null temperature values.

- [ ] **Step 3: Preserve fallback behavior**

If `weekly_trends` is empty, do not render the chart. If `temperature_error` is present, render the bars and show a small Ant Design warning `Alert`.

- [ ] **Step 4: Verify Web build**

Run:

```bash
cd apps/web && npm run build
```

Expected: Vite build exits 0.

### Task 3: iOS Model and Chart

**Files:**
- Modify: `apps/ios/LFAReader/Models/GlobalStats.swift`
- Modify: `apps/ios/LFAReader/Views/StatisticsView.swift`

- [ ] **Step 1: Extend model**

Add `WeeklyTrend` and `positiveCategories`, then decode `weekly_trends` and `temperature_error` from the backend response.

- [ ] **Step 2: Add chart data helpers**

In `StatisticsView.swift`, add small private structs for positive bar rows and temperature line rows. Keep the data transformation inside the detail view.

- [ ] **Step 3: Render Swift Charts section**

Insert `weeklyTrendSection(stats)` after `overviewSection(stats)`. Use grouped bars for positive counts and a blue line for available Fahrenheit temperature values.

- [ ] **Step 4: Verify iOS build**

Run the Xcode build through the available iOS build tooling for the existing `apps/ios/LFAReader.xcodeproj` scheme.

Expected: simulator build exits 0, or the exact local simulator/tooling blocker is captured.

### Task 4: Final Verification and Commit

**Files:**
- Review: all modified files

- [ ] **Step 1: Re-run backend tests**

Run:

```bash
PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_weekly_trends -v
```

- [ ] **Step 2: Re-run Web build**

Run:

```bash
cd apps/web && npm run build
```

- [ ] **Step 3: Run iOS build verification**

Run the configured Xcode simulator build command.

- [ ] **Step 4: Review diff**

Run:

```bash
git diff --stat
git diff --check
```

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add apps/backend/app/services/weekly_trends.py apps/backend/app/routers/stats.py apps/backend/tests/test_weekly_trends.py apps/web/src/pages/Statistics.jsx apps/ios/LFAReader/Models/GlobalStats.swift apps/ios/LFAReader/Views/StatisticsView.swift
git commit -m "feat: add weekly positive trend charts"
```
