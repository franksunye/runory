/**
 * Pure formatting functions for field display renderers.
 *
 * These are extracted from the `.tsx` display components so they can be
 * unit-tested in the Node-only vitest environment without requiring jsdom
 * or React Testing Library. Each renderer imports its formatting helper
 * from here, keeping the rendering component thin and the formatting logic
 * independently verifiable.
 */

/** Maps the Runory locale code to an Intl locale tag. */
export function intlLocale(locale: string): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

/**
 * Parses an ISO date string into a Date.
 *
 * Date-only strings (`YYYY-MM-DD`) are constructed in local time so a UTC
 * offset does not shift the rendered day by one. Full ISO strings (with
 * time/zone) parse normally. Invalid input returns `null` so the caller
 * can fall back to the raw string.
 */
export function parseDate(raw: string): Date | null {
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const local = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Formats a date value for the active locale using a short month, numeric day, and year. */
export function formatDateValue(value: unknown, locale: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  const parsed = parseDate(raw);
  if (!parsed) return raw;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

/** Formats a numeric value for the active locale. Returns the raw string for non-numeric input. */
export function formatNumberValue(value: unknown, locale: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat(intlLocale(locale)).format(numeric);
}

/** Localized yes/no label for a boolean value. */
export function formatBooleanLabel(value: unknown, locale: string): string | null {
  if (value === null || value === undefined) return null;
  const bool = Boolean(value);
  if (locale === "zh") return bool ? "是" : "否";
  return bool ? "Yes" : "No";
}

/**
 * Derives up to two uppercase initials from a display name.
 * Mirrors the existing `UserAvatar` initials convention.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/**
 * Resolves the display label for a lookup/user/select field, preferring
 * the resolved `displayValue` and falling back to the raw value.
 * Returns `null` for empty values so the caller can render the em dash.
 */
export function resolveDisplayLabel(
  value: unknown,
  displayValue?: string,
): string | null {
  const label =
    displayValue ??
    (value === null || value === undefined || value === "" ? undefined : String(value));
  if (label === undefined || label === "") return null;
  return label;
}
