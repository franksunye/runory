import { z } from "zod";

// ── Field Types ──
export const fieldTypes = ["text", "email", "phone", "number", "date", "select", "boolean", "lookup", "user"] as const;
export type FieldType = (typeof fieldTypes)[number];

// ── Module Manifest ──
export const fieldDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(fieldTypes),
  ownership: z.enum(["module_owned", "workspace_extension"]).default("module_owned"),
  required: z.boolean().default(false),
  default_value: z.string().optional(),
  validation: z.record(z.unknown()).optional(),
});

// ── Raw View Config (legacy input — accepts untrusted manifest/DB data) ──
export const viewConfigSchema = z.object({
  columns: z.array(z.object({
    field: z.string(),
    label: z.string().optional(),
    width: z.enum(["sm", "md", "lg"]).optional(),
  })).optional(),
  sections: z.array(z.object({
    key: z.string().optional(),
    title: z.string(),
    fields: z.array(z.object({
      field: z.string(),
      required: z.boolean().optional(),
    })),
  })).optional(),
  actions: z.array(z.union([
    z.string(),
    z.object({
      key: z.string(),
      label: z.string().optional(),
      kind: z.enum(["navigate", "command"]).optional(),
      permission: z.string().optional(),
      command: z.string().optional(),
      tone: z.enum(["primary", "secondary", "danger"]).optional(),
    }),
  ])).optional(),
  defaultSort: z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  defaultFilters: z.array(z.object({
    field: z.string(),
    operator: z.literal("eq"),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).optional(),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100), z.number()]).optional(),
  workspaceRoleDefaults: z.record(z.unknown()).optional(),
  emptyState: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    actionKey: z.string().optional(),
  }).optional(),
  schemaVersion: z.string().optional(),
}).passthrough();

export const viewDefinitionSchema = z.object({
  object: z.string(),
  key: z.string(),
  type: z.enum(["list", "form"]),
  label: z.string(),
  config: viewConfigSchema,
});

// ── Typed View Config v1.0 (validated output — Tech Spec §4.2–4.4) ──

export const viewActionSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: z.enum(["navigate", "command"]),
  permission: z.string().optional(),
  command: z.string().optional(),
  tone: z.enum(["primary", "secondary", "danger"]).optional(),
});
export type ViewAction = z.infer<typeof viewActionSchema>;

export const exactFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.literal("eq"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type ExactFilter = z.infer<typeof exactFilterSchema>;

export const sortDefinitionSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});
export type SortDefinition = z.infer<typeof sortDefinitionSchema>;

export const listViewPreferenceOverlaySchema = z.object({
  visibleFields: z.array(z.string()).optional(),
  filters: z.array(exactFilterSchema).optional(),
  sort: sortDefinitionSchema.optional(),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).optional(),
});
export type ListViewPreferenceOverlay = z.infer<typeof listViewPreferenceOverlaySchema>;

export const PAGE_SIZE_VALUES = [10, 20, 50, 100] as const;
export const pageSizeSchema = z.union([
  z.literal(10), z.literal(20), z.literal(50), z.literal(100),
]);

export const listViewConfigV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  columns: z.array(z.object({
    field: z.string().min(1),
    label: z.string().optional(),
    width: z.enum(["sm", "md", "lg"]).optional(),
  })).min(1),
  actions: z.array(viewActionSchema).default([]),
  defaultSort: sortDefinitionSchema.optional(),
  defaultFilters: z.array(exactFilterSchema).default([]),
  pageSize: pageSizeSchema,
  workspaceRoleDefaults: z.object({
    admin: listViewPreferenceOverlaySchema.optional(),
    member: listViewPreferenceOverlaySchema.optional(),
    viewer: listViewPreferenceOverlaySchema.optional(),
  }).optional(),
  emptyState: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    actionKey: z.string().optional(),
  }).optional(),
});
export type ListViewConfigV1 = z.infer<typeof listViewConfigV1Schema>;

export const formViewConfigV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  sections: z.array(z.object({
    key: z.string().min(1),
    title: z.string(),
    fields: z.array(z.object({
      field: z.string().min(1),
      required: z.boolean().optional(),
    })),
  })).min(1),
  actions: z.array(viewActionSchema).default([]),
});
export type FormViewConfigV1 = z.infer<typeof formViewConfigV1Schema>;

export type TypedViewConfig = ListViewConfigV1 | FormViewConfigV1;

export type ViewConfigParseResult =
  | { ok: true; config: TypedViewConfig }
  | { ok: false; errors: string[] };

/**
 * Normalize legacy view config (string actions, missing schemaVersion,
 * missing section keys) into a shape that the typed v1.0 schemas can validate.
 *
 * Per Tech Spec §4.4:
 * - string actions such as `create` and `view` normalize to action descriptors
 * - missing `schemaVersion` normalizes to `1.0`
 * - form sections without keys receive a deterministic key derived from the
 *   view key and section position
 */
export function normalizeLegacyViewConfig(
  raw: Record<string, unknown>,
  viewKey: string,
  viewType: "list" | "form",
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw };

  // Normalize string actions to ViewAction objects
  if (Array.isArray(normalized.actions)) {
    normalized.actions = (normalized.actions as unknown[]).map((action) => {
      if (typeof action === "string") {
        return {
          key: action,
          kind: action === "view" || action === "create" || action === "edit" ? "navigate" : "command",
        };
      }
      return action;
    });
  }

  // Normalize missing schemaVersion
  if (!normalized.schemaVersion) {
    normalized.schemaVersion = "1.0";
  }

  // Normalize form sections without keys
  if (viewType === "form" && Array.isArray(normalized.sections)) {
    normalized.sections = (normalized.sections as unknown[]).map((section, index) => {
      if (section && typeof section === "object" && !(section as Record<string, unknown>).key) {
        return {
          ...section as Record<string, unknown>,
          key: `${viewKey}_section_${index}`,
        };
      }
      return section;
    });
  }

  // Coerce arbitrary pageSize to nearest allowed value.
  // Per Tech Spec §4.3, page size outside the enum is rejected, not silently
  // coerced — but legacy manifests may use 25, 30, etc. We coerce to the
  // nearest valid value during normalization so legacy data remains readable;
  // invalid values that cannot be coerced (e.g. 0, negative) are left for
  // schema validation to reject.
  if (typeof normalized.pageSize === "number" && !PAGE_SIZE_VALUES.includes(normalized.pageSize as 10 | 20 | 50 | 100)) {
    const ps: number = normalized.pageSize;
    if (ps > 0) {
      // Prefer the larger value when equidistant (round up)
      const closest = PAGE_SIZE_VALUES.reduce((prev, curr) =>
        Math.abs(curr - ps) <= Math.abs(prev - ps) ? curr : prev,
      );
      normalized.pageSize = closest;
    }
  }

  // Default pageSize for list views when missing entirely.
  // The typed v1.0 schema requires pageSize, so legacy configs without it
  // receive the conventional default (20) during normalization.
  if (viewType === "list" && normalized.pageSize === undefined) {
    normalized.pageSize = 20;
  }

  return normalized;
}

/**
 * Parse and validate a raw view config through normalization + typed schema.
 * Returns a discriminated union: `{ ok: true, config }` or `{ ok: false, errors }`.
 */
export function parseViewConfig(
  raw: Record<string, unknown>,
  viewKey: string,
  viewType: "list" | "form",
): ViewConfigParseResult {
  const normalized = normalizeLegacyViewConfig(raw, viewKey, viewType);
  const schema = viewType === "list" ? listViewConfigV1Schema : formViewConfigV1Schema;
  const result = schema.safeParse(normalized);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
}

export const objectDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  fields: z.array(fieldDefinitionSchema),
  /**
   * Optional explicit display field for the object. When set, this field is
   * used as the human-readable identifier when the object is referenced by a
   * lookup/relation. When unset, the runtime falls back to a convention-based
   * resolution (tries: name, title, subject, summary, number, code, email).
   */
  displayField: z.string().optional(),
});

export const extensionPointSchema = z.object({
  entities: z.array(z.object({
    entity: z.string(),
    customFields: z.object({
      enabled: z.boolean(),
      allowedTypes: z.array(z.string()),
      maxFields: z.number().optional(),
      reservedKeys: z.array(z.string()),
    }).optional(),
    customRelations: z.object({
      enabled: z.boolean(),
    }).optional(),
  })).optional(),
  views: z.array(z.object({
    view: z.string(),
    slots: z.array(z.object({
      id: z.string(),
      type: z.string(),
      allowedExtensions: z.array(z.string()),
      risk: z.string().default("low"),
    })),
    allowReorder: z.boolean().default(false),
    allowFilters: z.boolean().default(false),
    allowAddSection: z.boolean().default(false),
    allowAddAction: z.boolean().default(false),
    allowPageSizeChange: z.boolean().default(false),
  })).optional(),
});

// ── Migration Graph (per docs/09 §8: migrations by from → to) ──
export const migrationStepSchema = z.object({
  from: z.string().optional(),        // undefined means "from empty" (fresh install)
  to: z.string(),                      // target version
  script: z.string(),                  // SQL file path
  checksum: z.string().optional(),     // SHA-256 of script content
  risk: z.enum(["low", "medium", "high"]).default("low"),
});

// ── Release Compatibility (per docs/09 §8) ──
export const releaseCompatibilitySchema = z.object({
  minCoreVersion: z.string().optional(),
  maxCoreVersion: z.string().optional(),
  minPlatformVersion: z.string().optional(),
  breakingChanges: z.array(z.object({
    description: z.string(),
    migrationRequired: z.boolean().default(false),
  })).default([]),
});

// ── Permission Change Policy (per docs/09 §8) ──
export const permissionChangePolicySchema = z.object({
  added: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
  requiresExplicitConsent: z.boolean().default(false),
});

// ── Dashboard Widgets (v0.2.1 Workbench Composition) ──
// See docs/product/v0.2.1-workbench-composition-plan.md

export const DASHBOARD_ZONES = ["metrics", "trends", "lists", "activity"] as const;
export type DashboardZone = (typeof DASHBOARD_ZONES)[number];

export const WIDGET_TYPES = ["metric_card", "trend_chart", "breakdown", "list", "activity_feed"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_VISUALIZATION_TYPES = ["bar", "line", "area", "donut"] as const;
export type WidgetVisualizationType = (typeof WIDGET_VISUALIZATION_TYPES)[number];

export const WIDGET_DATA_KINDS = ["count", "group_count", "recent", "timeseries"] as const;
export type WidgetDataKind = (typeof WIDGET_DATA_KINDS)[number];

// Configurable field declaration — what a workspace admin can override
export const widgetConfigurableFieldSchema = z.object({
  path: z.string(),                              // dot-path into widget, e.g. "data.limit"
  label: z.string(),
  type: z.enum(["text", "number", "select", "multiselect"]),
  options: z.array(z.string()).optional(),       // for select / multiselect
  min: z.number().optional(),                    // for number
  max: z.number().optional(),                    // for number
});

// Widget data intent — declarative, platform resolves to safe SQL
export const widgetDataIntentSchema = z.object({
  kind: z.enum(WIDGET_DATA_KINDS),
  object: z.string(),                            // a declared object of this module, OR a platform runtime object (see PLATFORM_OBJECT_*)
  where: z.string().optional(),                  // restricted expression, platform-parsed
  orderBy: z.string().optional(),                // "field asc|desc, ..."
  limit: z.number().optional(),                  // for recent
  groupBy: z.string().optional(),                // for group_count / timeseries
  range: z.enum(["7d", "14d", "30d"]).optional(), // for timeseries
  columns: z.array(z.string()).optional(),       // for recent
  join: z.object({
    object: z.string(),                          // platform runtime object to join to (e.g. "resources")
    on: z.string(),                              // foreign-key field on the base object (e.g. "resource_id")
    select: z.string(),                          // field to pull from the joined object (e.g. "display_name")
    as: z.string(),                              // alias for the selected column (e.g. "resource_name")
  }).optional(),                                 // for recent — enriches rows with a joined display field
});

// Sub-label intent for metric_card (optional secondary metric)
export const widgetSubIntentSchema = widgetDataIntentSchema.extend({
  template: z.string().optional(),               // e.g. "{count} 个已逾期"
});

// Widget declaration — a module's contribution to the workbench
export const widgetDeclarationSchema = z.object({
  key: z.string(),
  type: z.enum(WIDGET_TYPES),
  label: z.string(),
  icon: z.string().default("file"),
  tone: z.string().default("slate"),
  visualization: z.object({
    type: z.enum(WIDGET_VISUALIZATION_TYPES),
  }).optional(),
  data: widgetDataIntentSchema,
  sub: widgetSubIntentSchema.optional(),         // metric_card only
  link: z.string().optional(),
  configurable: z.array(widgetConfigurableFieldSchema).optional(),
});

export type WidgetDeclaration = z.infer<typeof widgetDeclarationSchema>;
export type WidgetDataIntent = z.infer<typeof widgetDataIntentSchema>;
export type WidgetConfigurableField = z.infer<typeof widgetConfigurableFieldSchema>;

// Module dashboard section
export const moduleDashboardSchema = z.object({
  widgets: z.array(widgetDeclarationSchema),
});

// Pack layout item — a reference to a widget with optional config override
export const packLayoutItemSchema = z.object({
  module: z.string(),                            // module id, or "_platform"
  widget: z.string(),                            // widget key
  instance: z.string().default("default"),       // for multi-instance widgets
  config: z.record(z.unknown()).optional(),      // config override applied to widget
});

// Pack layout zone — a group of widgets in a zone
export const packLayoutZoneSchema = z.object({
  zone: z.enum(DASHBOARD_ZONES),
  widgets: z.array(packLayoutItemSchema),
});

// Pack dashboard section
export const packDashboardSchema = z.object({
  defaultLayout: z.array(packLayoutZoneSchema),
});

export type PackLayoutItem = z.infer<typeof packLayoutItemSchema>;
export type PackLayoutZone = z.infer<typeof packLayoutZoneSchema>;
export type ModuleDashboard = z.infer<typeof moduleDashboardSchema>;
export type PackDashboard = z.infer<typeof packDashboardSchema>;

// ── Cross-Pack Relations (v0.2.3) ──
// A module can declare that its objects reference objects owned by another module.
// This enables cross-pack data integrity without coupling pack install order.
export const relationDeclarationSchema = z.object({
  object: z.string(),                  // this module's object key (must be declared in objects[])
  targetObject: z.string(),            // target object key (may be owned by another module)
  targetModule: z.string(),            // target module id (e.g., "runory.company")
  type: z.enum(["many_to_one", "one_to_many", "many_to_many"]),
  foreignKey: z.string(),              // field on this object that stores the target id
  label: z.string().optional(),        // human-readable relation label
  composition: z.object({
    columns: z.array(z.object({
      field: z.string(),
      label: z.string().optional(),
    })).min(1),
    allowCreate: z.boolean().default(true),
  }).optional(),
  /**
   * Controls how an incoming relation is presented on the target record.
   * Backlinks are hidden unless composition or this policy explicitly opts in.
   */
  backlinkPresentation: z.object({
    mode: z.enum(["compact", "summary", "hidden"]),
    columns: z.array(z.object({
      field: z.string(),
      label: z.string().optional(),
    })).min(1).optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }).refine(
    (value) => value.mode !== "compact" || Boolean(value.columns?.length),
    { message: "compact backlink presentation requires columns" }
  ).optional(),
});

export type RelationDeclaration = z.infer<typeof relationDeclarationSchema>;

// ── Module Presentation (v0.5 Phase 5 — Navigation Strategy) ──
// Controls how a module appears in navigation surfaces.
export const modulePresentationSchema = z.object({
  visibility: z.enum(["top_level", "contextual", "management", "hidden"]),
  surface: z.enum([
    "quotes",
    "work_orders",
    "planning",
    "forms",
    "my_work",
    "customers",
    "calls",
    "payments",
  ]).optional(),
  audience: z.array(z.string()).optional(),
});

export type ModulePresentation = z.infer<typeof modulePresentationSchema>;

// ── Contract-Driven Commands ──
//
// Modules declare business semantics, while Runtime providers own physical
// persistence. Keeping capability effects semantic lets independently
// versioned Modules and Packs compose without embedding cross-module SQL in a
// manifest.
export const commandConsistencySchema = z.enum(["atomic", "outbox", "projection"]);
export const commandOperationSchema = z.enum(["create", "transition", "action"]);
export const commandActorTypeSchema = z.enum(["user", "api_key", "system", "agent", "customer"]);

// ── Aggregate Lifecycle ──
//
// The command graph proves which transitions are legal, but not which of the
// legal states form the path a document is expected to travel. Operators need
// that spine to answer "where is this, and how much is left" — and a raw graph
// cannot answer it, because `blocked`, `reopened` and `cancelled` are all legal
// yet off-spine.
//
// Declaring the partition on the aggregate (the owner of `stateField`) keeps one
// source of truth for every surface — office, field app, customer portal — and
// lets Catalog validation reject a state that was added without being
// classified, which is what stops the declaration from drifting.
//
// Labels are deliberately absent: surfaces resolve them by convention from
// (object, state), so a manifest never carries UI copy or per-locale strings.

/** Proof of when a state was reached, in precedence order: column, then events. */
export const aggregateLifecycleEvidenceSchema = z.object({
  /** Governed domain events whose earliest occurrence dates this state. */
  events: z.array(z.string().min(1)).default([]),
  /** Aggregate column carrying an authoritative timestamp for this state. */
  timestampField: z.string().min(1).optional(),
});

export const aggregateLifecycleSchema = z.object({
  /** The expected path, in order. */
  spine: z.array(z.string().min(1)).min(2),
  /** State → spine state it sits at, for states reached by moving backwards. */
  aliases: z.record(z.string().min(1)).default({}),
  /** Paused on the spine: work can resume from where it stopped. */
  interrupts: z.array(z.string().min(1)).default([]),
  /** Ended off-spine: no further progress is expected. */
  terminals: z.array(z.string().min(1)).default([]),
  evidence: z.record(aggregateLifecycleEvidenceSchema).default({}),
});

export const aggregateContractSchema = z.object({
  key: z.string().min(1),
  stateField: z.string().min(1),
  versionField: z.string().min(1),
  lifecycle: aggregateLifecycleSchema.optional(),
});

export type AggregateLifecycleEvidence = z.infer<typeof aggregateLifecycleEvidenceSchema>;
export type AggregateLifecycle = z.infer<typeof aggregateLifecycleSchema>;

export const commandEffectRequirementSchema = z.object({
  capability: z.string().min(1),
  version: z.string().default("*"),
  scope: z.string().min(1),
  consistency: commandConsistencySchema,
  cardinality: z.enum(["one", "zero_or_one", "one_or_more", "zero_or_more"]).default("one"),
});

export const commandModuleRequirementSchema = z.object({
  id: z.string().min(1),
  version: z.string().default("*"),
});

// ── Command availability ──
//
// `transition.from` already says which states admit a Command. Two things it
// cannot say: whether the aggregate row itself still admits it (an Invoice with
// a payment on it can no longer be voided), and, for `create` Commands, which
// record a person is looking at when they issue it.
//
// Declaring both keeps availability derivable on the server, so every surface
// offers exactly the Commands the runtime would accept instead of maintaining
// its own copy of the rule.
export const commandAvailabilityPredicateSchema = z.discriminatedUnion("operator", [
  z.object({
    field: z.string().min(1),
    operator: z.literal("equals"),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    field: z.string().min(1),
    operator: z.literal("not_equals"),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    field: z.string().min(1),
    operator: z.literal("not_null"),
  }),
  z.object({
    field: z.string().min(1),
    operator: z.literal("is_null"),
  }),
]);

/**
 * How a Command reads to the person holding the record.
 *
 * - `advance` moves the record along the lifecycle spine: the expected next step.
 * - `decide` picks between divergent outcomes offered by one state (approve /
 *   decline / return). Stays visible even when the outcome is destructive.
 * - `escape_hatch` is an administrative override admitted by many states (block,
 *   cancel, void, withdraw, reopen). Never the expected next step.
 *
 * Declaring an intent is what puts a Command on the record's command surface.
 * Fine-grained operations invoked from purpose-built UI — editing quote lines,
 * recalculating totals — leave it unset and stay off that surface.
 */
export const commandIntentSchema = z.enum(["advance", "decide", "escape_hatch"]);

export const commandResultAssertionSchema = z.discriminatedUnion("operator", [
  z.object({
    field: z.string().min(1),
    operator: z.literal("equals"),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    field: z.string().min(1),
    operator: z.literal("not_null"),
  }),
]);

export const commandContractSchema = z.object({
  key: z.string().min(1),
  contractVersion: z.string().min(1),
  aggregate: z.string().min(1),
  operation: commandOperationSchema.default("transition"),
  transition: z.object({
    from: z.array(z.string().min(1)).min(1),
    // A command such as unblock may restore one of several explicitly
    // governed states. Enumerating those outcomes preserves validation without
    // introducing a wildcard/"derived" escape hatch.
    to: z.union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1),
    ]),
  }).optional(),
  permission: z.string().min(1),
  intent: commandIntentSchema.optional(),
  /**
   * Presentation token for the command surface (same vocabulary as navigation
   * and dashboard widget icons: `calendar`, `ban`, `send`, …). Surfaces map the
   * token to a concrete glyph; the Contract never names a UI library.
   */
  icon: z.string().min(1).optional(),
  /** The actor must supply a reason; surfaces prompt for it before dispatching. */
  requiresReason: z.boolean().default(false),
  /** Extra conditions on the aggregate row, beyond `transition.from`. */
  availableWhen: z.array(commandAvailabilityPredicateSchema).default([]),
  /**
   * For `create` Commands: the record a person is looking at when they issue it.
   * Without this, a Command that creates an Invoice from a Work Order has no
   * declared surface and each client has to hardcode where the button belongs.
   */
  initiatedFrom: z.object({
    aggregate: z.string().min(1),
    /** Command input field carrying the id of the record it was issued from. */
    idField: z.string().min(1),
    when: z.array(commandAvailabilityPredicateSchema).default([]),
  }).optional(),
  allowedActorTypes: z.array(commandActorTypeSchema).min(1)
    .default(["user", "api_key"]),
  idempotent: z.boolean().default(true),
  requiresExpectedVersion: z.boolean().default(true),
  requiresModules: z.array(commandModuleRequirementSchema).default([]),
  requiredEffects: z.array(commandEffectRequirementSchema).default([]),
  emits: z.array(z.string().min(1)).min(1),
  auditRequired: z.boolean().default(true),
  resultAssertions: z.array(commandResultAssertionSchema).default([]),
  postconditions: z.array(z.string().min(1)).min(1),
}).superRefine((command, context) => {
  if (command.operation === "transition" && !command.transition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transition"],
      message: "transition commands must declare source and target states",
    });
  }
  if (command.operation === "create" && command.transition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transition"],
      message: "create commands must not invent a source state transition",
    });
  }
  if (command.operation !== "create" && command.initiatedFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initiatedFrom"],
      message: "only create commands are initiated from another aggregate; "
        + "a transition command is surfaced on the aggregate it transitions",
    });
  }
  if (command.operation === "create" && command.requiresExpectedVersion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiresExpectedVersion"],
      message: "create commands cannot require an existing aggregate version",
    });
  }
});

export const commandCapabilityProviderDeclarationSchema = z.object({
  capability: z.string().min(1),
  version: z.string().min(1),
  consistency: commandConsistencySchema,
});

export const moduleDomainContractSchema = z.object({
  aggregates: z.array(aggregateContractSchema).default([]),
  commands: z.array(commandContractSchema).default([]),
  capabilities: z.object({
    provides: z.array(commandCapabilityProviderDeclarationSchema).default([]),
  }).optional(),
});

export type CommandConsistency = z.infer<typeof commandConsistencySchema>;
export type CommandOperation = z.infer<typeof commandOperationSchema>;
export type CommandActorType = z.infer<typeof commandActorTypeSchema>;
export type CommandIntent = z.infer<typeof commandIntentSchema>;
export type CommandAvailabilityPredicate = z.infer<typeof commandAvailabilityPredicateSchema>;
export type AggregateContract = z.infer<typeof aggregateContractSchema>;
export type CommandEffectRequirement = z.infer<typeof commandEffectRequirementSchema>;
export type CommandModuleRequirement = z.infer<typeof commandModuleRequirementSchema>;
export type CommandContract = z.infer<typeof commandContractSchema>;
export type CommandCapabilityProviderDeclaration = z.infer<typeof commandCapabilityProviderDeclarationSchema>;
export type ModuleDomainContract = z.infer<typeof moduleDomainContractSchema>;

// Platform Services (Workflow, Forms, Scheduling, etc.) participate in the
// same Command architecture without pretending to be installable business
// Modules. Their aggregate states are declared here because they do not own
// catalog object definitions.
export const platformServiceAggregateContractSchema = aggregateContractSchema.extend({
  states: z.array(z.string().min(1)).min(1),
});

export const platformServiceContractManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  manifestSchemaVersion: z.string().default("1.0.0"),
  coreCompatibility: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  domain: z.object({
    aggregates: z.array(platformServiceAggregateContractSchema).default([]),
    commands: z.array(commandContractSchema).default([]),
    capabilities: z.object({
      provides: z.array(commandCapabilityProviderDeclarationSchema).default([]),
    }).optional(),
  }),
});

export type PlatformServiceAggregateContract = z.infer<typeof platformServiceAggregateContractSchema>;
export type PlatformServiceContractManifest = z.infer<typeof platformServiceContractManifestSchema>;

// ── Customer Access (v0.8 Batch 3, Tech Spec §5) ──
//
// The customer-access Platform Service owns access grants and public
// authorization only. Capabilities are a closed enum — unknown values are
// rejected at issuance. Customer-visible DTOs are explicit projections, never
// raw business rows.

export const customerAccessCapabilitySchema = z.enum([
  "quote.view",
  "quote.accept",
  "work_order.view_status",
  "service_report.view",
  "invoice.view",
  "invoice.pay",
  "payment.view_status",
]);
export type CustomerAccessCapability = z.infer<typeof customerAccessCapabilitySchema>;

export const customerAccessSubjectTypeSchema = z.enum(["contact", "company"]);
export type CustomerAccessSubjectType = z.infer<typeof customerAccessSubjectTypeSchema>;

export const customerAccessRootObjectTypeSchema = z.enum(["quote", "work_order"]);
export type CustomerAccessRootObjectType = z.infer<typeof customerAccessRootObjectTypeSchema>;

export const customerAccessGrantStatusSchema = z.enum(["active", "revoked", "expired"]);
export type CustomerAccessGrantStatus = z.infer<typeof customerAccessGrantStatusSchema>;

/** Persisted grant row (never contains the raw token). */
export const customerAccessGrantSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  subjectType: customerAccessSubjectTypeSchema,
  subjectId: z.string(),
  rootObjectType: customerAccessRootObjectTypeSchema,
  rootRecordId: z.string(),
  capabilities: z.array(customerAccessCapabilitySchema),
  tokenHash: z.string(),
  expiresAt: z.string(),
  firstAccessedAt: z.string().nullable(),
  lastAccessedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  createdBy: z.string(),
  status: customerAccessGrantStatusSchema,
  aggregateVersion: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerAccessGrant = z.infer<typeof customerAccessGrantSchema>;

/** Issue request body (Spec §8.1). */
export const customerAccessIssueInputSchema = z.object({
  subjectType: customerAccessSubjectTypeSchema,
  subjectId: z.string().min(1),
  rootObjectType: customerAccessRootObjectTypeSchema,
  rootRecordId: z.string().min(1),
  capabilities: z.array(customerAccessCapabilitySchema).min(1),
  expiresAt: z.string().min(1),
});
export type CustomerAccessIssueInput = z.infer<typeof customerAccessIssueInputSchema>;

/** Issue response includes the access URL exactly once (Spec §8.1). */
export const customerAccessIssueResultSchema = z.object({
  grant: customerAccessGrantSchema,
  accessUrl: z.string().url(),
});
export type CustomerAccessIssueResult = z.infer<typeof customerAccessIssueResultSchema>;

// ── Customer-visible DTOs (Spec §5.4) ──
// Explicit projections — never raw business rows. Internal notes, ownership,
// assignment, provider references, failure payloads, audit internals, and
// attachment storage identifiers are excluded.

export const customerQuoteLineDtoSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
});
export type CustomerQuoteLineDto = z.infer<typeof customerQuoteLineDtoSchema>;

export const customerQuoteDtoSchema = z.object({
  id: z.string(),
  quoteNumber: z.string(),
  title: z.string(),
  status: z.string(),
  currency: z.string(),
  subtotal: z.number(),
  discountTotal: z.number(),
  taxTotal: z.number(),
  grandTotal: z.number(),
  validUntil: z.string().nullable(),
  terms: z.string().nullable(),
  revisionNumber: z.number(),
  acceptedAt: z.string().nullable(),
  lines: z.array(customerQuoteLineDtoSchema),
});
export type CustomerQuoteDto = z.infer<typeof customerQuoteDtoSchema>;

export const customerWorkOrderStatusDtoSchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string(),
  status: z.string(),
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  completedAt: z.string().nullable(),
  /** Optional site address when resolved from the related service site / visit. */
  siteAddress: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
});
export type CustomerWorkOrderStatusDto = z.infer<typeof customerWorkOrderStatusDtoSchema>;

export const customerServiceReportDtoSchema = z.object({
  id: z.string(),
  summary: z.string().nullable(),
  resolution: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type CustomerServiceReportDto = z.infer<typeof customerServiceReportDtoSchema>;

export const customerInvoiceLineDtoSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number(),
});
export type CustomerInvoiceLineDto = z.infer<typeof customerInvoiceLineDtoSchema>;

export const customerInvoiceDtoSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  status: z.string(),
  currency: z.string(),
  totalMinor: z.number(),
  amountPaidMinor: z.number(),
  balanceDueMinor: z.number(),
  issuedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  memo: z.string().nullable(),
  lines: z.array(customerInvoiceLineDtoSchema),
});
export type CustomerInvoiceDto = z.infer<typeof customerInvoiceDtoSchema>;

export const customerPaymentStatusDtoSchema = z.object({
  requestStatus: z.string(),
  paymentStatus: z.string().nullable(),
  amountMinor: z.number(),
  refundedAmountMinor: z.number(),
  currency: z.string(),
});
export type CustomerPaymentStatusDto = z.infer<typeof customerPaymentStatusDtoSchema>;

/** Customer-safe journey context returned by GET /api/customer-access/context (Spec §8.2). */
export const customerAccessContextDtoSchema = z.object({
  grant: z.object({
    id: z.string(),
    expiresAt: z.string(),
    capabilities: z.array(z.string()),
  }),
  workspace: z.object({
    name: z.string(),
  }),
  customer: z.object({
    displayName: z.string(),
  }),
  quote: customerQuoteDtoSchema.optional(),
  workOrder: customerWorkOrderStatusDtoSchema.optional(),
  serviceReports: z.array(customerServiceReportDtoSchema),
  invoice: customerInvoiceDtoSchema.optional(),
  payment: customerPaymentStatusDtoSchema.optional(),
  availableActions: z.array(z.enum(["quote.accept", "invoice.pay"])),
});
export type CustomerAccessContextDto = z.infer<typeof customerAccessContextDtoSchema>;

export const moduleManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  manifestSchemaVersion: z.string().default("1.0.0"),
  publisher: z.string().optional(),
  coreCompatibility: z.string(),
  // v0.4 — Module retirement metadata (e.g. quote_approval retired in v0.5).
  // When status is "retired", the installer skips installing the module for
  // new workspaces while leaving any existing tables read-only.
  status: z.string().optional(),
  retiredIn: z.string().optional(),
  retirementNote: z.string().optional(),
  releaseCompatibility: releaseCompatibilitySchema.optional(),
  dependencies: z.array(z.string()).optional(),
  objects: z.array(objectDefinitionSchema),
  views: z.array(viewDefinitionSchema),
  relations: z.array(relationDeclarationSchema).optional(),
  permissions: z.array(z.string()).optional(),
  permissionChangePolicy: permissionChangePolicySchema.optional(),
  migrations: z.object({
    install: z.string(),
    uninstallPolicy: z.string().default("retain_data"),
    upgrade: z.array(migrationStepSchema).optional(),
  }),
  ui: z.object({
    navigation: z.array(z.object({
      label: z.string(),
      route: z.string(),
      icon: z.string().default("file"),
      sortOrder: z.number().default(100),
      contextual: z.boolean().default(false),
    })).optional(),
  }).optional(),
  presentation: modulePresentationSchema.optional(),
  domain: moduleDomainContractSchema.optional(),
  extensionPoints: extensionPointSchema.optional(),
  dashboard: moduleDashboardSchema.optional(),
  upgradePolicy: z.object({
    supportsWorkspaceExtensions: z.boolean().default(true),
    breakingChangePolicy: z.string().default("manual_review"),
  }).optional(),
  dataOwnership: z.string().default("workspace"),
  uninstallRetentionPolicy: z.string().default("retain_data"),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

// ── Pack Manifest ──
export const packTerminologyEntrySchema = z.object({
  object: z.string(),                  // shared object key (e.g., "company")
  label: z.string().optional(),        // alternative object label for this pack
  navigationLabel: z.string().optional(), // alternative navigation label for this pack
  route: z.string().optional(),        // explicit navigation route to override (e.g., "/companies")
});

export const packTerminologySchema = z.array(packTerminologyEntrySchema);

export type PackTerminologyEntry = z.infer<typeof packTerminologyEntrySchema>;

// ── Onboarding Checklist (v0.3.4) ──
// Per-pack guided steps shown after installation.
export const onboardingChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),                          // e.g. "Create your first company"
  route: z.string().optional(),               // deep link, e.g. "/companies/new"
  description: z.string().optional(),
});
export type OnboardingChecklistItem = z.infer<typeof onboardingChecklistItemSchema>;

// v0.3.6 — Pack-aware permission groups
export const packPermissionGroupSchema = z.object({
  key: z.string(),                            // e.g. "sales_admin", "service_agent"
  label: z.string(),                          // e.g. "销售管理员"
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),  // e.g. ["deal.read", "deal.create"]
  businessRole: z.object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
  }).optional(),
});
export type PackPermissionGroup = z.infer<typeof packPermissionGroupSchema>;

export const packMobileNavigationItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  route: z.string(),
  icon: z.string().default("circle"),
  order: z.number().default(100),
  audience: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
});
export type PackMobileNavigationItem = z.infer<typeof packMobileNavigationItemSchema>;

// Cross-pack workspace surfaces are owned by the platform shell, while Packs
// explicitly contribute the capabilities that make them useful. This keeps
// optional product areas out of a newly-created workspace and lets install /
// uninstall naturally recompute the shell without hard-coded Pack checks.
export const workspaceSurfaceKeySchema = z.enum(["my_work", "planning", "activity"]);
export const packWorkspaceSurfaceSchema = z.object({
  key: workspaceSurfaceKeySchema,
  audience: z.array(z.string()).optional(),
});
export type WorkspaceSurfaceKey = z.infer<typeof workspaceSurfaceKeySchema>;
export type PackWorkspaceSurface = z.infer<typeof packWorkspaceSurfaceSchema>;

export const packManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  manifestSchemaVersion: z.string().default("1.0.0"),
  publisher: z.string().optional(),
  coreCompatibility: z.string(),
  modules: z.array(z.string()),
  defaultTemplate: z.string().optional(),
  releaseCompatibility: releaseCompatibilitySchema.optional(),
  terminology: packTerminologySchema.optional(),
  dashboard: packDashboardSchema.optional(),
  marketplace: z.object({
    category: z.string(),
    license: z.string(),
    publisher: z.string(),
  }).optional(),
  // v0.3.4 — Pack onboarding metadata
  description: z.string().optional(),
  recommended: z.boolean().optional(),
  onboardingChecklist: z.array(onboardingChecklistItemSchema).optional(),
  // v0.3.6 — Pack-aware permission groups
  permissionGroups: z.array(packPermissionGroupSchema).optional(),
  // v0.5.1 — Mobile/PWA navigation contributions.
  // Packs contribute mobile execution tabs; the mobile shell composes installed
  // pack contributions instead of hardcoding a single industry workflow.
  mobileNavigation: z.array(packMobileNavigationItemSchema).optional(),
  // v0.5.1 — Desktop platform-surface contributions. These are resolved with
  // the current user's effective Pack audiences by the navigation API.
  workspaceSurfaces: z.array(packWorkspaceSurfaceSchema).optional(),
});

export type PackManifest = z.infer<typeof packManifestSchema>;

// ── Template Manifest ──
export const templateManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  manifestSchemaVersion: z.string().default("1.0.0"),
  publisher: z.string().optional(),
  terminology: z.record(z.string()).optional(),
  navigation: z.array(z.string()).optional(),
  homepage: z.object({
    layout: z.string(),
    widgets: z.array(z.string()),
  }).optional(),
  roleEntry: z.record(z.string()).optional(),
  // Template must declare compatible Pack/Module ranges (docs/09 §8)
  compatiblePacks: z.array(z.string()).optional(),
  compatibleModules: z.array(z.string()).optional(),
});

export type TemplateManifest = z.infer<typeof templateManifestSchema>;

// ── Extension Plan (generated by Personal Agent, validated by Runory) ──
export const customFieldPlanSchema = z.object({
  targetObject: z.string(),
  fieldKey: z.string(),
  label: z.string(),
  type: z.enum(fieldTypes),
  ownership: z.literal("workspace_extension"),
  required: z.boolean().default(false),
  validation: z.record(z.unknown()).optional(),
  ui: z.object({
    listColumn: z.boolean().default(false),
    slot: z.string().optional(),
    order: z.number().default(100),
  }).optional(),
});

export const viewModificationPlanSchema = z.object({
  targetObject: z.string(),
  viewKey: z.string(),
  modifications: z.object({
    reorderColumns: z.array(z.string()).optional(),
    addFilters: z.array(z.object({
      field: z.string(),
      operator: z.enum(["eq", "neq", "contains", "gt", "lt", "gte", "lte", "in"]),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    })).optional(),
    addSection: z.object({
      title: z.string(),
      fields: z.array(z.object({
        field: z.string(),
        required: z.boolean().optional(),
      })),
      afterSection: z.string().optional(),
    }).optional(),
    addAction: z.string().optional(),
    pageSize: z.number().optional(),
  }),
});

export const extensionPlanSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  targetModules: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  customFields: z.array(customFieldPlanSchema).default([]),
  viewModifications: z.array(viewModificationPlanSchema).optional(),
});

export type ExtensionPlan = z.infer<typeof extensionPlanSchema>;
export type CustomFieldPlan = z.infer<typeof customFieldPlanSchema>;
export type ViewModificationPlan = z.infer<typeof viewModificationPlanSchema>;

// ── Workspace Provisioning (v0.9.0 Repeatable Delivery) ──

export const provisioningPackSpecSchema = z.object({
  packId: z.string(),
  includeDemoData: z.boolean().optional(),
});

export const provisioningExtensionSpecSchema = z.object({
  name: z.string(),
  plan: extensionPlanSchema,
});

export const provisioningSpecSchema = z.object({
  workspaceName: z.string(),
  templateId: z.string().optional(),
  packs: z.array(provisioningPackSpecSchema),
  extensions: z.array(provisioningExtensionSpecSchema).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const provisioningStepResultSchema = z.object({
  step: z.string(),
  status: z.enum(["success", "skipped", "failed"]),
  durationMs: z.number(),
  error: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const provisioningResultSchema = z.object({
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  status: z.enum(["success", "partial", "failed"]),
  steps: z.array(provisioningStepResultSchema),
  totalDurationMs: z.number(),
  packsInstalled: z.array(z.string()),
  extensionsApplied: z.array(z.string()),
  demoRecordsCreated: z.number(),
});

export const referenceSolutionSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  spec: provisioningSpecSchema,
});

export type ProvisioningPackSpec = z.infer<typeof provisioningPackSpecSchema>;
export type ProvisioningExtensionSpec = z.infer<typeof provisioningExtensionSpecSchema>;
export type ProvisioningSpec = z.infer<typeof provisioningSpecSchema>;
export type ProvisioningStepResult = z.infer<typeof provisioningStepResultSchema>;
export type ProvisioningResult = z.infer<typeof provisioningResultSchema>;
export type ReferenceSolution = z.infer<typeof referenceSolutionSchema>;

// ── Workspace Health Check (v0.9.0) ──

export const healthCheckCategorySchema = z.enum([
  "command_contracts",
  "schema_drift",
  "view_integrity",
  "entitlement",
  "extension_consistency",
  "installation",
]);

export const healthCheckItemSchema = z.object({
  category: healthCheckCategorySchema,
  status: z.enum(["healthy", "warning", "error"]),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const workspaceHealthReportSchema = z.object({
  workspaceId: z.string(),
  overallStatus: z.enum(["healthy", "warning", "error"]),
  items: z.array(healthCheckItemSchema),
  checkedAt: z.string(),
});

export type HealthCheckCategory = z.infer<typeof healthCheckCategorySchema>;
export type HealthCheckItem = z.infer<typeof healthCheckItemSchema>;
export type WorkspaceHealthReport = z.infer<typeof workspaceHealthReportSchema>;

// ── Support Diagnostics Package (v0.9.0) ──

export const diagnosticsPackageSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  generatedAt: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  contractInventory: z.record(z.string(), z.unknown()),
  compatibilityReport: z.record(z.string(), z.unknown()).optional(),
  rolloutStatus: z.array(z.record(z.string(), z.unknown())).default([]),
  outboxFailures: z.array(z.record(z.string(), z.unknown())).default([]),
  migrationState: z.record(z.string(), z.unknown()),
  installationErrors: z.array(z.record(z.string(), z.unknown())).default([]),
  healthReport: workspaceHealthReportSchema.optional(),
});

export type DiagnosticsPackage = z.infer<typeof diagnosticsPackageSchema>;

// ── Workspace Configuration Diff (v0.9.1) ──

export const configDiffChangeTypeSchema = z.enum([
  "added",
  "removed",
  "modified",
]);

export const configDiffCategorySchema = z.enum([
  "packs",
  "extensions",
  "objects",
  "fields",
  "views",
  "navigation",
  "relations",
  "automations",
  "workflows",
  "forms",
]);

export const configDiffEntrySchema = z.object({
  category: configDiffCategorySchema,
  changeType: configDiffChangeTypeSchema,
  identifier: z.string(),
  label: z.string().optional(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  detail: z.string().optional(),
});

export const configDiffSummarySchema = z.object({
  totalChanges: z.number(),
  additions: z.number(),
  removals: z.number(),
  modifications: z.number(),
  byCategory: z.record(configDiffCategorySchema, z.object({
    additions: z.number(),
    removals: z.number(),
    modifications: z.number(),
  })),
});

export const coverageMetricsSchema = z.object({
  standardCoveragePct: z.number(),
  extensionCoveragePct: z.number(),
  standardObjectCount: z.number(),
  extensionObjectCount: z.number(),
  standardFieldCount: z.number(),
  extensionFieldCount: z.number(),
  standardViewCount: z.number(),
  extensionViewCount: z.number(),
  standardNavigationCount: z.number(),
  extensionNavigationCount: z.number(),
  meets90_10Target: z.boolean(),
});

export const workspaceConfigDiffSchema = z.object({
  baselineWorkspaceId: z.string(),
  targetWorkspaceId: z.string(),
  generatedAt: z.string(),
  entries: z.array(configDiffEntrySchema),
  summary: configDiffSummarySchema,
  coverage: coverageMetricsSchema.optional(),
});

export type ConfigDiffChangeType = z.infer<typeof configDiffChangeTypeSchema>;
export type ConfigDiffCategory = z.infer<typeof configDiffCategorySchema>;
export type ConfigDiffEntry = z.infer<typeof configDiffEntrySchema>;
export type ConfigDiffSummary = z.infer<typeof configDiffSummarySchema>;
export type CoverageMetrics = z.infer<typeof coverageMetricsSchema>;
export type WorkspaceConfigDiff = z.infer<typeof workspaceConfigDiffSchema>;

// ── 90/10 Coverage Validation Report (v0.9.1) ──

export const workspaceCoverageEntrySchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  workspaceSlug: z.string(),
  coverage: coverageMetricsSchema,
  packCount: z.number(),
  extensionCount: z.number(),
  meetsTarget: z.boolean(),
});

export const coverageValidationReportSchema = z.object({
  generatedAt: z.string(),
  totalWorkspaces: z.number(),
  passingWorkspaces: z.number(),
  failingWorkspaces: z.number(),
  passRate: z.number(),
  averageStandardCoverage: z.number(),
  averageExtensionCoverage: z.number(),
  overallMeetsTarget: z.boolean(),
  workspaces: z.array(workspaceCoverageEntrySchema),
});

export type WorkspaceCoverageEntry = z.infer<typeof workspaceCoverageEntrySchema>;
export type CoverageValidationReport = z.infer<typeof coverageValidationReportSchema>;

// ── Extension Template Library (v0.9.1) ──

export const extensionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  targetSolutionTypes: z.array(z.string()).default([]),
  riskLevel: z.enum(["low", "medium", "high"]),
  plan: extensionPlanSchema,
});

export const extensionTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  targetSolutionTypes: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
  customFieldCount: z.number(),
  viewModificationCount: z.number(),
});

export type ExtensionTemplate = z.infer<typeof extensionTemplateSchema>;
export type ExtensionTemplateSummary = z.infer<typeof extensionTemplateSummarySchema>;

// ── Upgrade Executor (v0.9.4) ──

export const upgradeStepResultSchema = z.object({
  stepIndex: z.number(),
  fromVersion: z.string().optional(),
  toVersion: z.string(),
  script: z.string(),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  error: z.string().optional(),
  durationMs: z.number().default(0),
});

export const upgradeValidationCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "warn"]),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const upgradeExecutionResultSchema = z.object({
  rolloutId: z.string(),
  targetId: z.string(),
  workspaceId: z.string(),
  moduleId: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  status: z.enum(["succeeded", "failed", "skipped"]),
  steps: z.array(upgradeStepResultSchema),
  validations: z.array(upgradeValidationCheckSchema).default([]),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  error: z.string().optional(),
});

export type UpgradeStepResult = z.infer<typeof upgradeStepResultSchema>;
export type UpgradeValidationCheck = z.infer<typeof upgradeValidationCheckSchema>;
export type UpgradeExecutionResult = z.infer<typeof upgradeExecutionResultSchema>;

// ── Pack-level Rollback (v0.9.4) ──

export const rollbackSnapshotSchema = z.object({
  targetId: z.string(),
  workspaceId: z.string(),
  moduleId: z.string(),
  versionBeforeUpgrade: z.string(),
  versionAfterUpgrade: z.string(),
  capturedAt: z.string(),
  installationRecord: z.record(z.string(), z.unknown()),
  metadataState: z.object({
    objects: z.array(z.record(z.string(), z.unknown())),
    fields: z.array(z.record(z.string(), z.unknown())),
    views: z.array(z.record(z.string(), z.unknown())),
    navigation: z.array(z.record(z.string(), z.unknown())),
  }),
});

export const rollbackResultSchema = z.object({
  targetId: z.string(),
  workspaceId: z.string(),
  moduleId: z.string(),
  rolledBackToVersion: z.string(),
  status: z.enum(["succeeded", "failed", "partial"]),
  stepsTaken: z.array(z.string()),
  metadataRestored: z.boolean(),
  error: z.string().optional(),
  completedAt: z.string(),
});

export type RollbackSnapshot = z.infer<typeof rollbackSnapshotSchema>;
export type RollbackResult = z.infer<typeof rollbackResultSchema>;

// ── Contract Freeze Enforcement (v0.9.4) ──

export const contractFreezeCategorySchema = z.enum([
  "api_routes",
  "mcp_tools",
  "pack_manifests",
  "extension_contracts",
  "command_contracts",
  "permission_vocab",
]);

export const contractFreezeViolationSchema = z.object({
  category: contractFreezeCategorySchema,
  changeType: z.enum(["added", "removed", "modified"]),
  identifier: z.string(),
  detail: z.string().optional(),
});

export const contractFreezeSnapshotSchema = z.object({
  capturedAt: z.string(),
  contracts: z.record(contractFreezeCategorySchema, z.array(z.object({
    identifier: z.string(),
    checksum: z.string(),
  }))),
});

export const contractFreezeReportSchema = z.object({
  frozenAt: z.string(),
  currentSnapshot: contractFreezeSnapshotSchema,
  violations: z.array(contractFreezeViolationSchema),
  isFrozen: z.boolean(),
  totalViolations: z.number(),
});

export type ContractFreezeCategory = z.infer<typeof contractFreezeCategorySchema>;
export type ContractFreezeViolation = z.infer<typeof contractFreezeViolationSchema>;
export type ContractFreezeSnapshot = z.infer<typeof contractFreezeSnapshotSchema>;
export type ContractFreezeReport = z.infer<typeof contractFreezeReportSchema>;

// ── Upgrade Policy Publication (v0.9.4) ──

export const policyTypeSchema = z.enum([
  "compatibility",
  "upgrade",
  "deprecation",
  "known_boundaries",
]);

export const policyDocumentSchema = z.object({
  id: z.string(),
  type: policyTypeSchema,
  title: z.string(),
  description: z.string(),
  content: z.string(),
  version: z.string(),
  publishedAt: z.string(),
  publishedBy: z.string(),
  status: z.enum(["draft", "published", "superseded"]).default("published"),
});

export const policySummarySchema = z.object({
  id: z.string(),
  type: policyTypeSchema,
  title: z.string(),
  version: z.string(),
  status: z.enum(["draft", "published", "superseded"]),
  publishedAt: z.string(),
});

export type PolicyType = z.infer<typeof policyTypeSchema>;
export type PolicyDocument = z.infer<typeof policyDocumentSchema>;
export type PolicySummary = z.infer<typeof policySummarySchema>;

// ── Vocabulary Unification (v0.9.4) ──

export const vocabularyTermSchema = z.object({
  canonical: z.string(),
  aliases: z.array(z.string()).default([]),
  domain: z.enum(["lifecycle", "error_handling", "permissions", "ui", "agent_tools"]),
  description: z.string().optional(),
});

export const vocabularyUnificationReportSchema = z.object({
  generatedAt: z.string(),
  terms: z.array(vocabularyTermSchema),
  duplicateCapabilities: z.array(z.object({
    name: z.string(),
    sources: z.array(z.string()),
    recommendation: z.enum(["keep_first", "merge", "remove_all"]),
    reason: z.string(),
  })),
  unifiedCount: z.number(),
  remainingDuplicates: z.number(),
});

export type VocabularyTerm = z.infer<typeof vocabularyTermSchema>;
export type VocabularyUnificationReport = z.infer<typeof vocabularyUnificationReportSchema>;

// ── Automation Runtime (v0.3.5) ──

export const automationTriggerSchema = z.object({
  type: z.enum([
    "record_created",
    "record_updated",
    "record_field_changed",
    "schedule",
    "manual",
  ]),
  // Target object key for record-based triggers.
  targetObject: z.string().optional(),
  // For record_field_changed: the field key to watch.
  fieldKey: z.string().optional(),
  // For schedule: cron-like expression (minute hour day month weekday).
  // Restricted to intervals >= 10 minutes by the runtime.
  cron: z.string().optional(),
});

export const automationConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "in"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const automationActionSchema = z.object({
  type: z.enum([
    "create_task",
    "update_record",
    "send_notification",
    "transition_workflow",
    "set_field",
  ]),
  // Target object for create_task / update_record / set_field.
  targetObject: z.string().optional(),
  // For create_task: title template (supports {{record.field}} placeholders).
  title: z.string().optional(),
  description: z.string().optional(),
  // For update_record / set_field: field -> value map.
  fields: z.record(z.string(), z.unknown()).optional(),
  // For send_notification: message template.
  message: z.string().optional(),
  // For transition_workflow: workflow id and target transition id.
  workflowId: z.string().optional(),
  transitionId: z.string().optional(),
});

export const automationDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).min(1),
  enabled: z.boolean().default(true),
});

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;

// ── V2 Workflow Types (v0.5) ──

export const workflowStepKindSchema = z.enum([
  "start", "human_task", "approval", "system_command", "wait", "end",
]);
export type WorkflowStepKind = z.infer<typeof workflowStepKindSchema>;

export const workflowStepSchema = z.object({
  id: z.string(),
  kind: workflowStepKindSchema,
  next: z.string().optional(),
  command: z.string().optional(),
  assigneeRule: z.object({
    permissionGroup: z.string().optional(),
    userId: z.string().optional(),
  }).optional(),
  formBindingId: z.string().optional(),
  onApprove: z.string().optional(),
  onReject: z.string().optional(),
  policy: z.object({
    allowSelfApproval: z.boolean().optional(),
  }).optional(),
  sla: z.string().optional(),
  dueAt: z.string().optional(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowDefinitionV2Schema = z.object({
  workflowKey: z.string(),
  name: z.string(),
  targetObject: z.string(),
  initialState: z.string(),
  steps: z.array(workflowStepSchema),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionV2Schema>;

export interface WorkflowDefinitionVersion {
  id: string;
  workspaceId: string;
  workflowDefinitionId: string;
  versionNumber: number;
  definitionJson: string;
  schemaVersion: string;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface WorkflowInstance {
  id: string;
  workspaceId: string;
  workflowDefinitionId: string;
  definitionVersionId: string;
  objectType: string;
  recordId: string;
  status: string;
  currentStepId: string | null;
  version: number;
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  workspaceId: string;
  instanceId: string;
  stepId: string;
  kind: string;
  status: string;
  subjectType: string | null;
  subjectId: string | null;
  assigneeType: string | null;
  assigneeId: string | null;
  candidateRuleJson: string | null;
  dueAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  formBindingId: string | null;
  inputSnapshotJson: string | null;
  inputSnapshotHash: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Display enrichment (optional; filled by list/detail APIs). */
  title?: string | null;
  companyName?: string | null;
  siteName?: string | null;
  quoteNumber?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  assigneeDisplay?: string | null;
}

export interface WorkflowEvent {
  id: string;
  instanceId: string;
  sequence: number;
  eventType: string;
  stepId: string | null;
  actorType: string | null;
  actorId: string | null;
  /** Resolved person name; null when the actor is not a nameable user. */
  actorDisplay: string | null;
  payloadJson: string;
  occurredAt: string;
}

export interface ApprovalDecision {
  id: string;
  workspaceId: string;
  workItemId: string;
  outcome: "approved" | "rejected";
  decidedBy: string;
  decidedAt: string;
  comment: string | null;
  commandId: string | null;
}

export interface CommandExecution {
  id: string;
  workspaceId: string;
  commandId: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  actorType: string;
  actorId: string;
  inputHash: string;
  status: "started" | "succeeded" | "failed";
  resultJson: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  expectedVersion: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OutboxMessage {
  id: string;
  workspaceId: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

// ── Workflow Projection Types (v0.8 Batch 4, Tech Spec §11) ──

export const workflowOverviewStepSchema = z.object({
  id: z.string(),
  kind: workflowStepKindSchema,
  label: z.string(),
  next: z.array(z.string()),
});
export type WorkflowOverviewStep = z.infer<typeof workflowOverviewStepSchema>;

export const workflowOverviewSchema = z.object({
  workflowKey: z.string(),
  name: z.string(),
  targetObject: z.string(),
  versionNumber: z.number(),
  steps: z.array(workflowOverviewStepSchema),
});
export type WorkflowOverview = z.infer<typeof workflowOverviewSchema>;

export const workflowRunStepStateSchema = z.enum([
  "pending", "current", "completed", "cancelled",
]);
export type WorkflowRunStepState = z.infer<typeof workflowRunStepStateSchema>;

export const workflowRunStepSchema = z.object({
  id: z.string(),
  state: workflowRunStepStateSchema,
  workItemStatus: z.string().optional(),
  occurredAt: z.string().optional(),
  outcome: z.enum(["approved", "rejected", "returned", "cancelled"]).optional(),
});
export type WorkflowRunStep = z.infer<typeof workflowRunStepSchema>;

export const workflowRunNextActionSchema = z.object({
  kind: z.string(),
  workItemId: z.string().optional(),
});
export type WorkflowRunNextAction = z.infer<typeof workflowRunNextActionSchema>;

export const workflowRunProjectionSchema = z.object({
  instanceId: z.string(),
  status: z.enum(["running", "completed", "returned", "cancelled"]),
  currentStepId: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  steps: z.array(workflowRunStepSchema),
  nextAction: workflowRunNextActionSchema.optional(),
});
export type WorkflowRunProjection = z.infer<typeof workflowRunProjectionSchema>;

// ── V2 Form Block Types (v0.5) ──

export const formBlockTypeSchema = z.enum([
  "header", "field", "checklist", "evidence", "signature",
]);
export type FormBlockType = z.infer<typeof formBlockTypeSchema>;

export const formBlockSchema = z.object({
  block_type: formBlockTypeSchema,
  id: z.string(),
  label: z.string().optional(),
  field_key: z.string().optional(),
  field_type: z.enum(["text", "number", "date", "select", "boolean"]).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  items: z.array(z.object({
    id: z.string(),
    label: z.string(),
    required: z.boolean(),
    pass_fail_na: z.boolean().optional(),
  })).optional(),
  required_count: z.number().optional(),
  accepted_types: z.array(z.string()).optional(),
  acknowledgment_text: z.string().optional(),
});
export type FormBlock = z.infer<typeof formBlockSchema>;

export const formSchemaSchema = z.object({
  blocks: z.array(formBlockSchema),
});
export type FormSchema = z.infer<typeof formSchemaSchema>;

export const formUsageTypeSchema = z.enum([
  "workflow_step", "record_action", "public_endpoint",
  "marketing_capture", "service_deliverable",
]);
export type FormUsageType = z.infer<typeof formUsageTypeSchema>;

// ── API Response Types ──
export interface ToolEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export function ok<T>(data: T): ToolEnvelope<T> {
  return { success: true, data };
}

export function err(code: string, message: string): ToolEnvelope<never> {
  return { success: false, error: { code, message } };
}
