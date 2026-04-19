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

  const date = new Date(value);
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
