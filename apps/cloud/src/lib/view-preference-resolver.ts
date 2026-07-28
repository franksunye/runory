/**
 * Pure resolution logic for effective list view state.
 *
 * Implements the precedence order from the UI Surface Technical Decision §8:
 *
 *   typed View defaults
 *     → current-user preference
 *       → explicit URL query parameters
 *         → permission filtering
 *
 * URL values win over saved preferences. Absence of a URL value allows the
 * saved preference/default to apply. Typing in search or opening a shared
 * URL must NOT silently overwrite a saved preference — persistence happens
 * only on an explicit Save action.
 */

export interface ViewPreferenceData {
  visibleFields: string[];
  filters: Array<{ field: string; operator: "eq"; value: string | number | boolean }>;
  sort: { field: string; direction: "asc" | "desc" } | null;
  pageSize: number | null;
  version: number;
}

export interface URLQueryState {
  q?: string;
  sort?: string;
  filters?: Record<string, string>;
}

export interface ViewDefaults {
  columns: Array<{ field: string; label?: string; width?: "sm" | "md" | "lg" }>;
  defaultSort?: { field: string; direction: "asc" | "desc" };
  defaultPageSize?: number;
}

export interface EffectiveListState {
  /** Search query from URL or empty string. */
  search: string;
  /** Effective sort field, resolved from URL → preference → view default. */
  sortBy: string;
  /** Effective sort direction. */
  sortOrder: "asc" | "desc";
  /** Relation filters from URL. */
  filters: Record<string, string>;
  /** Page size from preference or view default. */
  pageSize: number;
  /** Effective visible field keys, filtered against the object's actual fields. */
  visibleFields: string[];
}

/**
 * Parse a URL sort string (`field:direction`) into its parts.
 * Returns null if the string is malformed.
 */
export function parseSortParam(sortStr: string | undefined): { field: string; direction: "asc" | "desc" } | null {
  if (!sortStr) return null;
  const parts = sortStr.split(":");
  if (parts.length !== 2) return null;
  const [field, direction] = parts;
  if (!field || (direction !== "asc" && direction !== "desc")) return null;
  return { field, direction };
}

/**
 * Resolve the effective list state from the layered sources.
 *
 * @param viewDefaults - The typed view configuration (columns, default sort/page size)
 * @param preference - The user's saved preference, or null if none exists
 * @param urlQuery - The explicit URL query parameters
 * @param availableFieldKeys - The set of field keys that exist on this object (for filtering)
 * @param fallbackPageSize - Fallback page size when neither view nor preference specifies one
 */
export function resolveEffectiveListState(
  viewDefaults: ViewDefaults,
  preference: ViewPreferenceData | null,
  urlQuery: URLQueryState,
  availableFieldKeys: Set<string>,
  fallbackPageSize: number = 20,
): EffectiveListState {
  // ── Search: URL-only, never persisted to preference ──
  const search = urlQuery.q ?? "";

  // ── Sort: URL → preference → view default ──
  const urlSort = parseSortParam(urlQuery.sort);
  const prefSort = preference?.sort ?? null;
  const defaultSort = viewDefaults.defaultSort ?? null;

  const effectiveSort = urlSort ?? prefSort ?? defaultSort ?? { field: "created_at", direction: "desc" as const };

  // ── Filters: URL-only (exact filters in URL), preference filters are a baseline ──
  // URL filters override preference filters for the same field; preference
  // filters for other fields are preserved.
  const urlFilters = urlQuery.filters ?? {};
  const prefFilters = preference?.filters ?? [];
  const mergedFilters: Record<string, string> = {};

  // Start with preference filters
  for (const f of prefFilters) {
    mergedFilters[f.field] = String(f.value);
  }
  // URL filters override
  for (const [key, value] of Object.entries(urlFilters)) {
    mergedFilters[key] = value;
  }

  // ── Page size: preference → view default → fallback ──
  const pageSize = preference?.pageSize ?? viewDefaults.defaultPageSize ?? fallbackPageSize;

  // ── Visible fields: preference → view columns ──
  const prefFields = preference?.visibleFields ?? [];
  const viewFields = viewDefaults.columns.map((c) => c.field);

  let visibleFields: string[];
  if (prefFields.length > 0) {
    // Use preference fields, filtered against available fields
    visibleFields = prefFields.filter((f) => availableFieldKeys.has(f));
    // If filtering removed everything, fall back to view columns
    if (visibleFields.length === 0) {
      visibleFields = viewFields;
    }
  } else {
    visibleFields = viewFields;
  }

  return {
    search,
    sortBy: effectiveSort.field,
    sortOrder: effectiveSort.direction,
    filters: mergedFilters,
    pageSize,
    visibleFields,
  };
}

/**
 * Build a preference input from the current effective state for a Save action.
 * Only called when the user explicitly clicks "Save view preferences".
 */
export function buildPreferenceInput(
  state: EffectiveListState,
  expectedVersion?: number,
): ViewPreferenceData & { expectedVersion?: number } {
  return {
    visibleFields: state.visibleFields,
    filters: Object.entries(state.filters).map(([field, value]) => ({
      field,
      operator: "eq" as const,
      value,
    })),
    sort: { field: state.sortBy, direction: state.sortOrder },
    pageSize: state.pageSize,
    version: 0, // Will be set by the API
    expectedVersion,
  };
}
