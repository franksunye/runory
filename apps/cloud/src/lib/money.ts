/**
 * Money presentation helpers for Cloud UI.
 *
 * Domain / API amounts stay in minor units + currency (payment architecture).
 * These helpers only convert for human-facing inputs and Intl display.
 */

export function minorToMajor(amountMinor: number): number {
  if (!Number.isFinite(amountMinor)) return 0;
  return Number((amountMinor / 100).toFixed(2));
}

export function majorToMinor(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) return 0;
  return Math.round(amountMajor * 100);
}

export function formatMinorAmount(
  amountMinor: number,
  currency: string,
  locale?: string,
): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(minorToMajor(amountMinor));
  } catch {
    return `${minorToMajor(amountMinor).toFixed(2)} ${code}`;
  }
}

/** Prefer business identity fields over a generic object-type label. */
export function recordDisplayName(
  record: Record<string, unknown>,
  fallback: string,
): string {
  const candidates = [
    record.title,
    record.name,
    record.quote_number,
    record.work_order_number,
    record.invoice_number,
    record.number,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}
