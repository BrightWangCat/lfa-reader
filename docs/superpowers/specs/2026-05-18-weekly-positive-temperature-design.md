# Weekly Positive Results and Temperature Design

## Context

The LFA Reader statistics surface currently shows workflow-level global test totals, per-dimension positive distributions, and a Columbus zip code map. The current backend endpoint is `GET /api/stats/global`, and both Web and iOS consume it for a selected disease workflow.

The new feature adds a 12-week trend view to the existing Global Test Statistics workflow detail. It must show weekly positive result counts separately for `Positive L`, `Positive I`, and `Positive L+I`, with a Columbus, Ohio weekly average temperature line in Fahrenheit.

## Confirmed Requirements

- Add the trend chart to both Web and iOS statistics detail screens.
- Use the currently selected disease workflow as the positive count filter.
- Show the most recent 12 Sunday-Saturday weeks.
- Include the current in-progress week, using available test records through request time.
- Preserve weeks with zero positive results.
- Keep `Positive L`, `Positive I`, and `Positive L+I` as separate bar groups.
- Fetch Columbus, Ohio temperature once per week series, not per disease workflow.
- Display temperature in Fahrenheit.
- If weather lookup fails, still return and render positive counts with temperature values unavailable.
- Do not add or change database schema.
- Do not read, modify, delete, or expose uploads, SQLite database contents beyond normal aggregate counting, `.env`, credentials, or logs.

## Architecture

The backend remains the source of truth for aggregation. `GET /api/stats/global` will be extended with a `weekly_trends` array so Web and iOS keep the same statistical and weather data contract.

The backend will:

1. Build the latest 12 Sunday-Saturday week windows based on server date.
2. Query images with patient information and valid classification.
3. Apply the existing disease workflow filter and final-result rule, where `manual_correction` overrides `cv_result`.
4. Count weekly `Positive L`, `Positive I`, and `Positive L+I` values.
5. Fetch daily mean temperature for Columbus, Ohio from Open-Meteo's Historical Weather API using latitude `39.9612`, longitude `-82.9988`, and Fahrenheit units.
6. Aggregate daily values into weekly means.
7. Return positive counts even if temperature fetch or parsing fails.

The frontends will render the new array without adding new user controls. The chart placement is immediately below the summary cards and above existing dimension pie sections.

## API Contract

`GET /api/stats/global?disease_category=<label>` will continue returning existing fields and add:

```json
{
  "weekly_trends": [
    {
      "week_start": "2026-03-01",
      "week_end": "2026-03-07",
      "label": "Mar 1",
      "positive_counts": {
        "Positive L": 3,
        "Positive I": 1,
        "Positive L+I": 0
      },
      "avg_temperature_f": 47.6
    }
  ],
  "temperature_error": null
}
```

`temperature_error` is `null` when temperatures are available. If the weather service fails, it becomes a generic client-safe string such as `Temperature data unavailable`; no upstream error body or URL with sensitive runtime context is exposed.

## Web Design

`apps/web/src/pages/Statistics.jsx` will add a `WeeklyTrendChart` component using the existing `@ant-design/charts` dependency. The chart will use grouped columns for the three positive categories and a line for weekly average temperature.

Visual rules:

- Title: `Weekly Positive Results and Columbus Temperature`
- Subtitle: `Last 12 Sunday-Saturday weeks, Columbus, OH average temperature in °F`
- Category colors reuse existing positive category colors.
- Temperature line uses a distinct blue already present in the statistics page.
- Empty positive weeks still appear on the x-axis.
- If temperatures are unavailable, render bars without the line and show a small warning below the chart.

## iOS Design

`apps/ios/LFAReader/Models/GlobalStats.swift` will decode `weekly_trends` and `temperature_error`. `StatisticsView.swift` will add a weekly trend section after `overviewSection`.

Swift Charts rendering:

- Use grouped `BarMark` values for `Positive L`, `Positive I`, and `Positive L+I`.
- Use `LineMark` for `avg_temperature_f` where non-null.
- Keep the section compact and readable on iPhone by using the weekly label on the x-axis.
- Use the same category color mapping as existing statistics sections.
- If temperature is unavailable, show only bars and a small secondary text message.

## Error Handling

Weather errors are non-blocking. The stats endpoint must not return HTTP 500 solely because Open-Meteo is unavailable or returns incomplete data. It should still return weekly counts and a generic `temperature_error`.

If no tests exist for the selected workflow, the existing empty state behavior remains. The backend should still include 12 trend rows in the response, but the current Web and iOS screens may not render the detailed content because they already show a no-data state when total is zero.

## Verification

Backend verification will cover week-window creation, Sunday-Saturday bucketing, manual-correction precedence, zero-filled weeks, and weather failure behavior.

Web verification will run the build or lint command available in `apps/web`, then render the statistics route locally when practical and inspect for runtime or chart errors.

iOS verification will attempt an Xcode simulator build through the available iOS build tooling. If the local environment lacks a compatible simulator or signing state, the blocker will be reported with the exact command result.

## Deployment Notes

Because this touches backend code, AWS validation requires the existing local-first workflow:

1. Complete and commit changes locally.
2. User pushes the branch or commits to the Git remote.
3. On AWS host `/home/ubuntu/lfa-reader`, run `scripts/backup.sh backend-change`.
4. Run `git pull`.
5. Restart backend and rebuild Web assets as needed.

Codex must not run `git push`.
