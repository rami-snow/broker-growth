/**
 * Organisation-local wall-clock time handling. HTML datetime-local inputs carry no time zone, so
 * the value must be read in the organisation's zone, never the server's or the browser's.
 * Organisations do not store a zone yet; every current tenant uses this default.
 */
export const DEFAULT_ORGANISATION_TIME_ZONE = "Australia/Sydney";

const offsetAt = (timestamp: number, timeZone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(timestamp / 1000) * 1000;
};

/**
 * Converts "YYYY-MM-DDTHH:mm[:ss]" entered by a user into an ISO instant, reading it in `timeZone`.
 * Values that already include an offset or Z are returned as the same instant.
 */
export function zonedLocalToIso(value: string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE): string {
  const trimmed = value.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) { const parsed = Date.parse(trimmed); if (!Number.isFinite(parsed)) throw new Error("Enter a valid date and time."); return new Date(parsed).toISOString(); }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) throw new Error("Enter a valid date and time.");
  const [, y, mo, d, h, mi, s] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  let instant = wall - offsetAt(wall, timeZone);
  const adjusted = offsetAt(instant, timeZone);
  if (adjusted !== wall - instant) instant = wall - adjusted;
  return new Date(instant).toISOString();
}

/** The organisation's zone, or the default for organisations created before the time zone field existed. */
export const organisationTimeZone = (organisation?: { timeZone?: string | null } | null) => organisation?.timeZone || DEFAULT_ORGANISATION_TIME_ZONE;

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`. */
export function businessDateIn(now: Date, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
