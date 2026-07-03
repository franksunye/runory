/**
 * Pure functions for bidirectional objectKey ↔ URL route segment conversion.
 *
 * These are extracted from dynamic-object.ts (which is a "use client" module)
 * so they can be unit-tested in a Node environment without React/SWR dependencies.
 *
 * Canonical mappings (v0.4.0):
 *   company         ↔ companies
 *   contact         ↔ contacts
 *   deal            ↔ deals
 *   task            ↔ tasks
 *   work_order      ↔ work-orders
 *   service_site    ↔ service-sites
 *   asset           ↔ assets
 *   service_visit   ↔ service-visits
 *   service_report  ↔ service-reports
 *   technician      ↔ technicians
 *   product_service ↔ product-services
 *   price_book      ↔ price-books
 *   knowledge       ↔ knowledge        (uncountable)
 *   customer_success ↔ customer-success (uncountable "success")
 */

/**
 * Explicit overrides for object keys whose route segment doesn't follow
 * the standard pluralize-last-token heuristic (uncountable nouns, etc.).
 * Checked before the heuristic in both directions.
 */
const ROUTE_OVERRIDES: Record<string, string> = {
  knowledge: "knowledge",
  customer_success: "customer-success",
};
const ROUTE_OVERRIDES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTE_OVERRIDES).map(([k, v]) => [v, k]),
);

/**
 * Explicit redirects for retired module routes (v0.4).
 * Maps a legacy route segment to a new destination path. When a retired
 * module's navigation route is accessed, the caller should redirect to the
 * destination here instead of rendering the retired view.
 */
const ROUTE_REDIRECTS: Record<string, string> = {
  "quote-approvals": "/my-work?kind=approval&subjectType=quote",
};

/**
 * Pluralize the last token of an objectKey for URL display.
 * - Ends in "y" → "ies"  (company → companies)
 * - Ends in "s" → "es"   (status → statuses)
 * - Otherwise   → "+s"   (contact → contacts)
 */
function pluralizeRouteToken(token: string): string {
  if (token.endsWith("y")) return `${token.slice(0, -1)}ies`;
  if (token.endsWith("s")) return `${token}es`;
  return `${token}s`;
}

/**
 * Convert a URL segment to an objectKey.
 * "service-sites" → "service_site", "companies" → "company"
 */
export function segmentToObjectKey(segment: string): string {
  if (ROUTE_OVERRIDES_REVERSE[segment]) return ROUTE_OVERRIDES_REVERSE[segment];
  const parts = segment.split("-");
  const last = parts[parts.length - 1] ?? segment;
  let singular = last;
  if (last.endsWith("ies")) {
    singular = `${last.slice(0, -3)}y`; // companies → company
  } else if (last.endsWith("ses")) {
    singular = last.slice(0, -2); // statuses → status
  } else if (last.endsWith("s")) {
    singular = last.slice(0, -1); // reports → report, sites → site
  }
  return [...parts.slice(0, -1), singular].join("_");
}

/**
 * Convert an objectKey to the canonical dynamic route segment.
 * "service_site" → "service-sites", "company" → "companies"
 */
export function objectKeyToRouteSegment(objectKey: string): string {
  if (ROUTE_OVERRIDES[objectKey]) return ROUTE_OVERRIDES[objectKey];
  const parts = objectKey.split("_");
  const last = parts[parts.length - 1] ?? objectKey;
  return [...parts.slice(0, -1), pluralizeRouteToken(last)].join("-");
}

/**
 * Convert an objectKey to a human-readable English title (fallback).
 * "service_site" → "Service Site"
 */
export function objectKeyToTitle(objectKey: string): string {
  return objectKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Look up a redirect destination for a retired route segment (v0.4).
 * Returns the destination path if the segment has been retired and redirected,
 * or null if no redirect applies. Callers should issue a client-side redirect
 * to the returned path instead of rendering the retired view.
 */
export function getRouteRedirect(segment: string): string | null {
  return ROUTE_REDIRECTS[segment] ?? null;
}
