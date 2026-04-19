const EASTERN_TIME_ZONE = "America/New_York";

const easternDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

function parseDate(value) {
  if (!value) {
    return null;
  }

  const normalizedValue =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value}Z`
      : value;

  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEasternDateTime(value) {
  const date = parseDate(value);
  if (!date) {
    return value || "--";
  }

  return `${easternDateTimeFormatter.format(date)} ET`;
}

export function formatEasternDate(value) {
  const date = parseDate(value);
  if (!date) {
    return value || "--";
  }

  return `${easternDateFormatter.format(date)} ET`;
}
