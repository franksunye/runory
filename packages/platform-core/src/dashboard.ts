import {
  type WidgetDeclaration,
  type WidgetDataIntent,
  type ModuleManifest,
  type PackManifest,
  type PackLayoutItem,
  type PackLayoutZone,
  type DashboardZone,
  DASHBOARD_ZONES,
} from "@runory/contracts";
import { queryAll, queryOne, query, validateIdentifier } from "./db";
import { TABLES, businessTable } from "./contracts";
import { getInstallations } from "./metadata";
import { loadModuleManifest, loadPackManifest } from "./installer";
import { InvalidInputError } from "./context";

// ─────────────────────────────────────────────────────────────────────────────
// Platform-built-in widgets (module = "_platform")
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_WIDGETS: WidgetDeclaration[] = [
  {
    key: "business_activity_feed",
    type: "activity_feed",
    label: "业务动态",
    icon: "activity",
    tone: "slate",
    data: { kind: "count", object: "_audit" }, // sentinel; resolved specially
  },
];

export function getPlatformWidget(widgetKey: string): WidgetDeclaration | undefined {
  return PLATFORM_WIDGETS.find((w) => w.key === widgetKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Available Widgets — collect from all installed modules + platform
// ─────────────────────────────────────────────────────────────────────────────

export interface AvailableWidget {
  moduleId: string;
  widget: WidgetDeclaration;
}

/**
 * Collect all dashboard widgets available to a workspace.
 * = union of dashboard.widgets across all installed modules + platform-built-in widgets.
 */
export async function getAvailableWidgets(
  workspaceId: string
): Promise<AvailableWidget[]> {
  const installations = await getInstallations(workspaceId);
  const result: AvailableWidget[] = [];

  // Platform widgets always available
  for (const widget of PLATFORM_WIDGETS) {
    result.push({ moduleId: "_platform", widget });
  }

  // Module widgets
  for (const inst of installations) {
    // Accept both "installed" and "active" statuses
    if (inst.status !== "active" && inst.status !== "installed") continue;
    try {
      const manifest = loadModuleManifest(inst.moduleId);
      if (manifest.dashboard?.widgets) {
        for (const widget of manifest.dashboard.widgets) {
          result.push({ moduleId: inst.moduleId, widget });
        }
      }
    } catch {
      // Module manifest may be unavailable; skip silently
    }
  }

  return result;
}

/**
 * Find a specific widget declaration by module + key.
 */
export async function findWidgetDeclaration(
  workspaceId: string,
  moduleId: string,
  widgetKey: string
): Promise<WidgetDeclaration | undefined> {
  if (moduleId === "_platform") {
    return getPlatformWidget(widgetKey);
  }
  const available = await getAvailableWidgets(workspaceId);
  return available
    .filter((aw) => aw.moduleId === moduleId && aw.widget.key === widgetKey)
    .map((aw) => aw.widget)[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Where Expression Parser
// Grammar:
//   where := clause (and clause)*
//   clause := field operator value
//   operator := = | != | in | not in | < | <= | > | >= | like
//   value := string | number | "today" | "now"
// ─────────────────────────────────────────────────────────────────────────────

export interface WhereClause {
  field: string;
  operator: string;
  value: string | number | string[];
}

const WHERE_OPERATORS = ["=", "!=", "in", "not in", "<", "<=", ">", ">=", "like"] as const;

/**
 * Parse a where expression string into structured clauses.
 * Throws InvalidInputError on unsupported syntax.
 */
export function parseWhereExpression(expr: string): WhereClause[] {
  const trimmed = expr.trim();
  if (!trimmed) return [];

  // Split on " and " (case-insensitive, word-boundary)
  const parts = trimmed.split(/\s+and\s+/i);
  const clauses: WhereClause[] = [];

  for (const part of parts) {
    const clause = parseClause(part.trim());
    if (clause) clauses.push(clause);
  }

  return clauses;
}

function parseClause(part: string): WhereClause {
  // Try two-word operators first: "not in", "in"
  // Then single-word operators: =, !=, <, <=, >, >=, like

  // Match: field <op> value
  // Operators: =, !=, <, <=, >, >=, like, in, not in

  // Try "not in" first
  let m = part.match(/^(\w+)\s+not\s+in\s+\(([^)]*)\)$/i);
  if (m) {
    return { field: m[1], operator: "not in", value: parseValueList(m[2]) };
  }

  // Try "in"
  m = part.match(/^(\w+)\s+in\s+\(([^)]*)\)$/i);
  if (m) {
    return { field: m[1], operator: "in", value: parseValueList(m[2]) };
  }

  // Try "like"
  m = part.match(/^(\w+)\s+like\s+(.+)$/i);
  if (m) {
    return { field: m[1], operator: "like", value: stripQuotes(m[2]) };
  }

  // Try symbolic operators: !=, <=, >=, =, <, >
  m = part.match(/^(\w+)\s*(!=|<=|>=|=|<|>)\s*(.+)$/);
  if (m) {
    const op = m[2];
    if (!WHERE_OPERATORS.includes(op as never)) {
      throw new InvalidInputError(`Unsupported operator: ${op}`);
    }
    return { field: m[1], operator: op, value: parseScalarValue(m[3]) };
  }

  throw new InvalidInputError(`Cannot parse where clause: "${part}"`);
}

function parseValueList(raw: string): string[] {
  return raw.split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
}

function parseScalarValue(raw: string): string | number {
  const v = raw.trim();
  // Number?
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return stripQuotes(v);
}

function stripQuotes(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Resolve "today" / "now" platform constants to ISO strings.
 */
function resolveValue(value: string | number | string[]): string | number | string[] {
  if (typeof value === "string") {
    if (value === "today") {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    }
    if (value === "now") {
      return new Date().toISOString();
    }
  }
  return value;
}

/**
 * Translate parsed where clauses into SQL fragment + bind parameters.
 * Field names are validated as identifiers (no injection).
 */
export function whereToSql(clauses: WhereClause[]): { sql: string; args: unknown[] } {
  if (clauses.length === 0) return { sql: "", args: [] };

  const parts: string[] = [];
  const args: unknown[] = [];

  for (const clause of clauses) {
    const field = validateIdentifier(clause.field);
    const val = resolveValue(clause.value);

    switch (clause.operator) {
      case "=":
      case "!=":
        parts.push(`${field} ${clause.operator} ?`);
        args.push(val);
        break;
      case "<":
      case "<=":
      case ">":
      case ">=":
        parts.push(`${field} ${clause.operator} ?`);
        args.push(val);
        break;
      case "like":
        parts.push(`${field} LIKE ?`);
        args.push(val);
        break;
      case "in": {
        const arr = Array.isArray(val) ? val : [val];
        if (arr.length === 0) {
          parts.push("1=0"); // IN () is invalid SQL; match nothing
        } else {
          const placeholders = arr.map(() => "?").join(", ");
          parts.push(`${field} IN (${placeholders})`);
          args.push(...arr);
        }
        break;
      }
      case "not in": {
        const arr = Array.isArray(val) ? val : [val];
        if (arr.length === 0) {
          parts.push("1=1"); // NOT IN () matches everything
        } else {
          const placeholders = arr.map(() => "?").join(", ");
          parts.push(`${field} NOT IN (${placeholders})`);
          args.push(...arr);
        }
        break;
      }
      default:
        throw new InvalidInputError(`Unsupported operator in SQL translation: ${clause.operator}`);
    }
  }

  return { sql: parts.join(" AND "), args };
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderBy Parser
// "priority desc, due_date asc" → [{ field: "priority", direction: "desc" }, ...]
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderByClause {
  field: string;
  direction: "asc" | "desc";
}

export function parseOrderBy(expr: string | undefined): OrderByClause[] {
  if (!expr || !expr.trim()) return [];
  return expr.split(",").map((part) => {
    const tokens = part.trim().split(/\s+/);
    const field = validateIdentifier(tokens[0]);
    const direction = (tokens[1] ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
    return { field, direction };
  });
}

export function orderByToSql(clauses: OrderByClause[]): string {
  if (clauses.length === 0) return "";
  return clauses.map((c) => `${c.field} ${c.direction}`).join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget Data Resolver — translates data intent into safe SQL and executes
// ─────────────────────────────────────────────────────────────────────────────

export interface WidgetDataResult {
  kind: WidgetDataIntent["kind"];
  // count
  count?: number;
  // group_count
  groups?: Array<{ key: string; count: number }>;
  // recent
  records?: Array<Record<string, unknown>>;
  // timeseries
  series?: Array<{ date: string; count: number }>;
}

/**
 * Resolve a widget data intent into actual data.
 * The caller must have already validated that `intent.object` belongs to the
 * declaring module and that all referenced fields exist.
 */
export async function resolveWidgetData(
  workspaceId: string,
  intent: WidgetDataIntent
): Promise<WidgetDataResult> {
  const table = businessTable(intent.object);
  const whereClauses = parseWhereExpression(intent.where ?? "");
  const { sql: whereSql, args: whereArgs } = whereToSql(whereClauses);

  const whereFragment = whereSql ? `WHERE workspace_id = ? AND ${whereSql}` : `WHERE workspace_id = ?`;
  const baseArgs = [workspaceId, ...whereArgs];

  switch (intent.kind) {
    case "count": {
      const row = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table} ${whereFragment}`,
        baseArgs
      );
      return { kind: "count", count: row?.count ?? 0 };
    }

    case "group_count": {
      if (!intent.groupBy) throw new InvalidInputError("groupBy is required for group_count");
      const groupField = validateIdentifier(intent.groupBy);
      const rows = await queryAll<{ key: string; count: number }>(
        `SELECT ${groupField} as key, COUNT(*) as count FROM ${table} ${whereFragment} GROUP BY ${groupField} ORDER BY count DESC`,
        baseArgs
      );
      return { kind: "group_count", groups: rows.map((r) => ({ key: String(r.key), count: r.count })) };
    }

    case "recent": {
      const orderClauses = parseOrderBy(intent.orderBy);
      const orderSql = orderByToSql(orderClauses) || "created_at DESC";
      const limit = Math.min(Math.max(intent.limit ?? 10, 1), 100);
      const columns = (intent.columns ?? ["id"]).map(validateIdentifier);
      const colSql = columns.join(", ");
      const rows = await queryAll<Record<string, unknown>>(
        `SELECT ${colSql} FROM ${table} ${whereFragment} ORDER BY ${orderSql} LIMIT ?`,
        [...baseArgs, limit]
      );
      return { kind: "recent", records: rows };
    }

    case "timeseries": {
      const range = intent.range ?? "14d";
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 14;
      const now = new Date();
      // Use UTC date arithmetic to avoid timezone drift between startDate and the fill loop
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startDate = new Date(todayUTC.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      const startISO = startDate.toISOString();

      const rows = await queryAll<{ date: string; count: number }>(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM ${table} ${whereFragment} AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date`,
        [...baseArgs, startISO]
      );

      // Fill missing days with 0 (UTC-based to match SQLite DATE() which uses UTC)
      const series: Array<{ date: string; count: number }> = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(todayUTC.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().slice(0, 10);
        const found = rows.find((r) => r.date === dateStr);
        series.push({ date: dateStr, count: found?.count ?? 0 });
      }
      return { kind: "timeseries", series };
    }

    default:
      throw new InvalidInputError(`Unknown widget data kind: ${intent.kind}`);
  }
}

/**
 * Resolve the activity feed data from the audit log.
 * This is the canonical platform-owned feed.
 */
export async function resolveActivityFeed(
  workspaceId: string,
  limit = 10
): Promise<Array<{
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorType: string;
  actorId: string;
  afterJson: string | null;
}>> {
  const rows = await queryAll<{
    id: string; action: string; entity_type: string; entity_id: string;
    created_at: string; actor_type: string; actor_id: string; after_json: string | null;
  }>(
    `SELECT id, action, entity_type, entity_id, created_at, actor_type, actor_id, after_json
     FROM ${TABLES.auditLogs}
     WHERE workspace_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [workspaceId, Math.min(Math.max(limit, 1), 50)]
  );
  return rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    createdAt: r.created_at, actorType: r.actor_type, actorId: r.actor_id,
    afterJson: r.after_json,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Resolution — merge available widgets + pack default + workspace overrides
// ─────────────────────────────────────────────────────────────────────────────

export interface LayoutItem {
  zone: DashboardZone;
  moduleId: string;
  widgetKey: string;
  instance: string;
  position: number;
  hidden: boolean;
  configOverride: Record<string, unknown> | null;
  // Resolved at read time:
  widget?: WidgetDeclaration;
}

export interface WorkspaceLayoutOverride {
  zone: DashboardZone;
  widgetModule: string;
  widgetKey: string;
  widgetInstance: string;
  position: number;
  hidden: boolean;
  configOverride: Record<string, unknown> | null;
}

/**
 * Load the pack default layout for a workspace.
 * Merges multiple packs in installation order (deterministic append).
 * Duplicate layout items: earlier installation wins.
 */
export async function resolvePackDefaultLayout(
  workspaceId: string
): Promise<PackLayoutZone[]> {
  const installations = await getInstallations(workspaceId);

  // Get unique pack IDs in installation order
  const packIds: string[] = [];
  for (const inst of installations) {
    if (inst.packId && !packIds.includes(inst.packId)) {
      packIds.push(inst.packId);
    }
  }

  // Merge layouts
  const mergedZones = new Map<DashboardZone, Map<string, PackLayoutItem>>();
  // identity key = zone + module + widget + instance

  for (const packId of packIds) {
    try {
      // Load pack manifest (synchronous — reads from filesystem)
      let manifest: PackManifest | undefined;
      try {
        manifest = loadPackManifest(packId);
      } catch {
        continue;
      }
      if (!manifest?.dashboard?.defaultLayout) continue;

      for (const zoneDef of manifest.dashboard.defaultLayout) {
        if (!mergedZones.has(zoneDef.zone)) {
          mergedZones.set(zoneDef.zone, new Map());
        }
        const zoneMap = mergedZones.get(zoneDef.zone)!;
        for (const item of zoneDef.widgets) {
          const instance = item.instance ?? "default";
          const identity = `${item.module}:${item.widget}:${instance}`;
          // Earlier installation wins — only add if not already present
          if (!zoneMap.has(identity)) {
            zoneMap.set(identity, { ...item, instance });
          }
        }
      }
    } catch {
      // Skip packs that fail to load
    }
  }

  // Convert to ordered array, following canonical zone order
  const result: PackLayoutZone[] = [];
  for (const zone of DASHBOARD_ZONES) {
    const zoneMap = mergedZones.get(zone);
    if (zoneMap && zoneMap.size > 0) {
      result.push({
        zone,
        widgets: Array.from(zoneMap.values()),
      });
    }
  }
  return result;
}

/**
 * Load workspace layout overrides from the runtime table.
 */
export async function getWorkspaceLayoutOverrides(
  workspaceId: string
): Promise<WorkspaceLayoutOverride[]> {
  const rows = await queryAll<{
    zone: string; widget_module: string; widget_key: string; widget_instance: string;
    position: number; hidden: number; config_override: string | null;
  }>(
    `SELECT zone, widget_module, widget_key, widget_instance, position, hidden, config_override
     FROM ${TABLES.workspaceDashboardLayout}
     WHERE workspace_id = ?
     ORDER BY zone, position`,
    [workspaceId]
  );
  return rows.map((r) => ({
    zone: r.zone as DashboardZone,
    widgetModule: r.widget_module,
    widgetKey: r.widget_key,
    widgetInstance: r.widget_instance,
    position: r.position,
    hidden: r.hidden === 1,
    configOverride: r.config_override ? JSON.parse(r.config_override) : null,
  }));
}

/**
 * Resolve the effective layout for a workspace.
 * Merges: available widgets + pack default layout + workspace overrides.
 */
export async function resolveEffectiveLayout(
  workspaceId: string
): Promise<LayoutItem[]> {
  const [available, packLayout, overrides] = await Promise.all([
    getAvailableWidgets(workspaceId),
    resolvePackDefaultLayout(workspaceId),
    getWorkspaceLayoutOverrides(workspaceId),
  ]);

  // Build widget lookup: "moduleId:widgetKey" → WidgetDeclaration
  const widgetLookup = new Map<string, WidgetDeclaration>();
  for (const aw of available) {
    widgetLookup.set(`${aw.moduleId}:${aw.widget.key}`, aw.widget);
  }

  // Build override lookup: "zone:module:widget:instance" → override
  const overrideLookup = new Map<string, WorkspaceLayoutOverride>();
  for (const ov of overrides) {
    const key = `${ov.zone}:${ov.widgetModule}:${ov.widgetKey}:${ov.widgetInstance}`;
    overrideLookup.set(key, ov);
  }

  const items: LayoutItem[] = [];

  // If pack has a default layout, use it as the base
  if (packLayout.length > 0) {
    for (const zoneDef of packLayout) {
      let position = 0;
      for (const item of zoneDef.widgets) {
        const instance = item.instance ?? "default";
        const overrideKey = `${zoneDef.zone}:${item.module}:${item.widget}:${instance}`;
        const override = overrideLookup.get(overrideKey);

        const widget = widgetLookup.get(`${item.module}:${item.widget}`);
        if (!widget) continue; // widget no longer available (module uninstalled)

        items.push({
          zone: zoneDef.zone,
          moduleId: item.module,
          widgetKey: item.widget,
          instance,
          position: override?.position ?? position,
          hidden: override?.hidden ?? false,
          configOverride: override?.configOverride ?? (item.config as Record<string, unknown> | undefined) ?? null,
          widget,
        });
        position++;
      }
    }
  } else {
    // Fallback: render all available widgets in declaration order
    // Group by widget type into zones
    const zoneMap = new Map<DashboardZone, AvailableWidget[]>();
    for (const aw of available) {
      let zone: DashboardZone;
      switch (aw.widget.type) {
        case "metric_card": zone = "metrics"; break;
        case "trend_chart": zone = "trends"; break;
        case "list": zone = "lists"; break;
        case "activity_feed": zone = "activity"; break;
        case "breakdown": zone = "metrics"; break;
        default: zone = "lists";
      }
      if (!zoneMap.has(zone)) zoneMap.set(zone, []);
      zoneMap.get(zone)!.push(aw);
    }

    for (const zone of DASHBOARD_ZONES) {
      const widgets = zoneMap.get(zone) ?? [];
      let position = 0;
      for (const aw of widgets) {
        const instance = "default";
        const overrideKey = `${zone}:${aw.moduleId}:${aw.widget.key}:${instance}`;
        const override = overrideLookup.get(overrideKey);

        items.push({
          zone,
          moduleId: aw.moduleId,
          widgetKey: aw.widget.key,
          instance,
          position: override?.position ?? position,
          hidden: override?.hidden ?? false,
          configOverride: override?.configOverride ?? null,
          widget: aw.widget,
        });
        position++;
      }
    }
  }

  // Sort by zone order then position
  const zoneOrder = new Map(DASHBOARD_ZONES.map((z, i) => [z, i]));
  return items
    .filter((item) => !item.hidden)
    .sort((a, b) => {
      const zo = zoneOrder.get(a.zone)! - zoneOrder.get(b.zone)!;
      if (zo !== 0) return zo;
      return a.position - b.position;
    });
}

/**
 * Resolve a widget's effective config by merging its declaration with a config override.
 */
export function mergeWidgetConfig(
  widget: WidgetDeclaration,
  override: Record<string, unknown> | null
): WidgetDeclaration {
  if (!override) return widget;

  // Deep merge: override recursively merges into widget declaration
  return deepMerge(widget, override) as WidgetDeclaration;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = (result as Record<string, unknown>)[key];
    if (isObject(sourceVal) && isObject(targetVal)) {
      (result as Record<string, unknown>)[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      (result as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return result;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Personalization — CRUD on workspace_dashboard_layout
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateLayoutOverrideInput {
  zone: DashboardZone;
  widgetModule: string;
  widgetKey: string;
  widgetInstance?: string;
  position?: number;
  hidden?: boolean;
  configOverride?: Record<string, unknown> | null;
}

/**
 * Upsert a single layout override.
 */
export async function upsertLayoutOverride(
  workspaceId: string,
  input: UpdateLayoutOverrideInput,
  updatedBy: string
): Promise<void> {
  const instance = input.widgetInstance ?? "default";
  const existing = await queryOne<{ position: number; hidden: number }>(
    `SELECT position, hidden FROM ${TABLES.workspaceDashboardLayout}
     WHERE workspace_id = ? AND zone = ? AND widget_module = ? AND widget_key = ? AND widget_instance = ?`,
    [workspaceId, input.zone, input.widgetModule, input.widgetKey, instance]
  );

  const position = input.position ?? existing?.position ?? 0;
  const hidden = input.hidden ?? (existing ? existing.hidden === 1 : false);
  const configJson = input.configOverride !== undefined
    ? JSON.stringify(input.configOverride)
    : null;

  await query(
    `INSERT INTO ${TABLES.workspaceDashboardLayout}
     (workspace_id, zone, widget_module, widget_key, widget_instance, position, hidden, config_override, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, zone, widget_module, widget_key, widget_instance)
     DO UPDATE SET
       position = excluded.position,
       hidden = excluded.hidden,
       config_override = excluded.config_override,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    [
      workspaceId, input.zone, input.widgetModule, input.widgetKey, instance,
      position, hidden ? 1 : 0, configJson, new Date().toISOString(), updatedBy,
    ]
  );
}

/**
 * Batch update layout overrides (for reorder operations).
 */
export async function batchUpdateLayoutOverrides(
  workspaceId: string,
  updates: UpdateLayoutOverrideInput[],
  updatedBy: string
): Promise<void> {
  for (const update of updates) {
    await upsertLayoutOverride(workspaceId, update, updatedBy);
  }
}

/**
 * Reset all layout overrides for a workspace (return to pack default).
 */
export async function resetLayoutOverrides(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM ${TABLES.workspaceDashboardLayout} WHERE workspace_id = ?`,
    [workspaceId]
  );
}

/**
 * Delete layout overrides for a specific module (used when uninstalling a module).
 * Overrides are preserved per the plan §11.3 — this is NOT called on uninstall.
 * Kept for potential future use (e.g., workspace purge).
 */
export async function deleteLayoutOverridesForModule(
  workspaceId: string,
  moduleId: string
): Promise<void> {
  await query(
    `DELETE FROM ${TABLES.workspaceDashboardLayout}
     WHERE workspace_id = ? AND widget_module = ?`,
    [workspaceId, moduleId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers — used by catalog-validation pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a module's dashboard.widgets declarations.
 * Returns an array of error messages (empty = valid).
 */
export function validateModuleDashboard(
  manifest: ModuleManifest
): string[] {
  const errors: string[] = [];

  if (!manifest.dashboard?.widgets) return errors;

  // Collect declared object keys
  const objectKeys = new Set(manifest.objects.map((o) => o.key));
  // Collect declared field keys per object, plus implicit system fields
  // System fields exist on every business table but are not declared in the manifest
  const SYSTEM_FIELDS = new Set(["id", "workspace_id", "created_at", "updated_at"]);
  const fieldKeysByObject = new Map<string, Set<string>>();
  for (const obj of manifest.objects) {
    const fields = new Set(obj.fields.map((f) => f.key));
    for (const sf of SYSTEM_FIELDS) fields.add(sf);
    fieldKeysByObject.set(obj.key, fields);
  }

  // Check widget key uniqueness
  const widgetKeys = new Set<string>();
  // Track configurable paths for validation
  const widgetByKey = new Map<string, WidgetDeclaration>();

  for (const widget of manifest.dashboard.widgets) {
    // Reject module-declared activity_feed
    if (widget.type === "activity_feed") {
      errors.push(
        `Widget "${widget.key}": modules cannot declare type "activity_feed" — it is platform-owned`
      );
      continue;
    }

    // Check widget key uniqueness
    if (widgetKeys.has(widget.key)) {
      errors.push(`Duplicate widget key: "${widget.key}"`);
    }
    widgetKeys.add(widget.key);
    widgetByKey.set(widget.key, widget);

    // Validate data.object exists in this module
    if (!objectKeys.has(widget.data.object)) {
      errors.push(
        `Widget "${widget.key}": data.object "${widget.data.object}" is not declared by module "${manifest.id}"`
      );
      continue; // Skip further field validation if object is invalid
    }

    const fieldKeys = fieldKeysByObject.get(widget.data.object)!;

    // Validate where expression references only declared fields
    if (widget.data.where) {
      try {
        const clauses = parseWhereExpression(widget.data.where);
        for (const clause of clauses) {
          if (!fieldKeys.has(clause.field)) {
            errors.push(
              `Widget "${widget.key}": where clause references unknown field "${clause.field}" on object "${widget.data.object}"`
            );
          }
        }
      } catch (e) {
        errors.push(
          `Widget "${widget.key}": invalid where expression — ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // Validate orderBy references only declared fields
    if (widget.data.orderBy) {
      try {
        const orderClauses = parseOrderBy(widget.data.orderBy);
        for (const clause of orderClauses) {
          if (!fieldKeys.has(clause.field)) {
            errors.push(
              `Widget "${widget.key}": orderBy references unknown field "${clause.field}" on object "${widget.data.object}"`
            );
          }
        }
      } catch (e) {
        errors.push(
          `Widget "${widget.key}": invalid orderBy expression — ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // Validate groupBy references a declared field
    if (widget.data.groupBy && !fieldKeys.has(widget.data.groupBy)) {
      errors.push(
        `Widget "${widget.key}": groupBy references unknown field "${widget.data.groupBy}" on object "${widget.data.object}"`
      );
    }

    // Validate columns reference declared fields
    if (widget.data.columns) {
      for (const col of widget.data.columns) {
        if (!fieldKeys.has(col)) {
          errors.push(
            `Widget "${widget.key}": column "${col}" is not a declared field on object "${widget.data.object}"`
          );
        }
      }
    }

    // Validate sub intent (for metric_card)
    if (widget.sub) {
      if (widget.sub.object && !objectKeys.has(widget.sub.object)) {
        errors.push(
          `Widget "${widget.key}": sub.object "${widget.sub.object}" is not declared by module "${manifest.id}"`
        );
      }
      if (widget.sub.where) {
        try {
          const subClauses = parseWhereExpression(widget.sub.where);
          const subFieldKeys = fieldKeysByObject.get(widget.sub.object);
          if (subFieldKeys) {
            for (const clause of subClauses) {
              if (!subFieldKeys.has(clause.field)) {
                errors.push(
                  `Widget "${widget.key}": sub.where references unknown field "${clause.field}" on object "${widget.sub.object}"`
                );
              }
            }
          }
        } catch (e) {
          errors.push(
            `Widget "${widget.key}": invalid sub.where expression — ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate a pack's dashboard.defaultLayout.
 * Returns an array of error messages (empty = valid).
 */
export function validatePackDashboard(
  manifest: PackManifest
): string[] {
  const errors: string[] = [];

  if (!manifest.dashboard?.defaultLayout) return errors;

  // Collect module IDs included in this pack
  const packModuleIds = new Set(
    manifest.modules.map((m) => m.split(":")[0])
  );
  packModuleIds.add("_platform"); // platform widgets always allowed

  const seenIdentities = new Set<string>();

  for (const zoneDef of manifest.dashboard.defaultLayout) {
    // Zone is already validated by zod enum, but double-check
    if (!DASHBOARD_ZONES.includes(zoneDef.zone)) {
      errors.push(`Unknown zone: "${zoneDef.zone}" — must be one of ${DASHBOARD_ZONES.join(", ")}`);
    }

    for (const item of zoneDef.widgets) {
      const moduleId = item.module;
      const instance = item.instance ?? "default";

      // Check module is included in this pack
      if (!packModuleIds.has(moduleId)) {
        errors.push(
          `Layout item (zone="${zoneDef.zone}", module="${moduleId}", widget="${item.widget}"): module "${moduleId}" is not included in pack "${manifest.id}"`
        );
      }

      // Check identity uniqueness
      const identity = `${zoneDef.zone}:${moduleId}:${item.widget}:${instance}`;
      if (seenIdentities.has(identity)) {
        errors.push(
          `Duplicate layout item: zone="${zoneDef.zone}", module="${moduleId}", widget="${item.widget}", instance="${instance}" — use a distinct instance key for multi-instance widgets`
        );
      }
      seenIdentities.add(identity);
    }
  }

  return errors;
}
