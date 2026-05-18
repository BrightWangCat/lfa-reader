from datetime import date, datetime, timedelta, timezone
import json
from typing import Callable, Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


POSITIVE_TREND_CATEGORIES = ["Positive L", "Positive I", "Positive L+I"]
COLUMBUS_LATITUDE = "39.9612"
COLUMBUS_LONGITUDE = "-82.9988"
COLUMBUS_TIMEZONE = ZoneInfo("America/New_York")
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def build_week_windows(today: date | None = None, week_count: int = 12) -> list[dict]:
    today = today or datetime.now(COLUMBUS_TIMEZONE).date()
    days_since_sunday = (today.weekday() + 1) % 7
    current_week_start = today - timedelta(days=days_since_sunday)
    first_week_start = current_week_start - timedelta(weeks=week_count - 1)

    windows = []
    for offset in range(week_count):
        start = first_week_start + timedelta(weeks=offset)
        end = start + timedelta(days=6)
        windows.append({
            "start_date": start,
            "end_date": end,
            "week_start": start.isoformat(),
            "week_end": end.isoformat(),
            "label": f"{start.strftime('%b')} {start.day}",
        })
    return windows


def aggregate_weekly_counts(
    records: Iterable[tuple[str, datetime]],
    windows: list[dict],
) -> list[dict[str, int]]:
    weekly_counts = [
        {category: 0 for category in POSITIVE_TREND_CATEGORIES}
        for _ in windows
    ]

    for final_result, created_at in records:
        if final_result not in POSITIVE_TREND_CATEGORIES:
            continue

        created_date = _to_columbus_date(created_at)
        for index, window in enumerate(windows):
            if window["start_date"] <= created_date <= window["end_date"]:
                weekly_counts[index][final_result] += 1
                break

    return weekly_counts


def fetch_columbus_daily_mean_temperatures(
    start_date: date,
    end_date: date,
    timeout_seconds: int = 10,
    opener: Callable | None = None,
) -> dict[date, float]:
    params = urlencode({
        "latitude": COLUMBUS_LATITUDE,
        "longitude": COLUMBUS_LONGITUDE,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "temperature_2m_mean",
        "temperature_unit": "fahrenheit",
        "timezone": "America/New_York",
    })
    request = Request(
        f"{OPEN_METEO_ARCHIVE_URL}?{params}",
        headers={"User-Agent": "lfa-reader/0.2.0"},
    )
    open_fn = opener or urlopen
    with open_fn(request, timeout=timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))

    daily = payload.get("daily") or {}
    days = daily.get("time") or []
    temperatures = daily.get("temperature_2m_mean") or []

    result: dict[date, float] = {}
    for day, temperature in zip(days, temperatures):
        if temperature is None:
            continue
        result[date.fromisoformat(day)] = float(temperature)
    return result


def combine_weekly_trends(
    windows: list[dict],
    weekly_counts: list[dict[str, int]],
    daily_temperatures: dict[date, float],
) -> list[dict]:
    trends = []
    for window, counts in zip(windows, weekly_counts):
        values = [
            temperature
            for day, temperature in daily_temperatures.items()
            if window["start_date"] <= day <= window["end_date"]
        ]
        avg_temperature = round(sum(values) / len(values), 1) if values else None
        trends.append({
            "week_start": window["week_start"],
            "week_end": window["week_end"],
            "label": window["label"],
            "positive_counts": counts,
            "avg_temperature_f": avg_temperature,
        })
    return trends


def build_weekly_trends(
    records: Iterable[tuple[str, datetime]],
    temperature_fetcher: Callable[[date, date], dict[date, float]] = fetch_columbus_daily_mean_temperatures,
    today: date | None = None,
) -> tuple[list[dict], str | None]:
    today = today or datetime.now(COLUMBUS_TIMEZONE).date()
    windows = build_week_windows(today=today)
    weekly_counts = aggregate_weekly_counts(records, windows)
    temperature_error = None

    try:
        temperature_end_date = min(windows[-1]["end_date"], today)
        daily_temperatures = temperature_fetcher(
            windows[0]["start_date"],
            temperature_end_date,
        )
    except Exception:
        daily_temperatures = {}
        temperature_error = "Temperature data unavailable"

    return combine_weekly_trends(windows, weekly_counts, daily_temperatures), temperature_error


def _to_columbus_date(value: datetime) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(COLUMBUS_TIMEZONE).date()
