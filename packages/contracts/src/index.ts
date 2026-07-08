import { z } from "zod";

// ── Field Types ──
export const fieldTypes = ["text", "email", "phone", "number", "date", "select", "boolean", "lookup"] as const;
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

export const viewConfigSchema = z.object({
  columns: z.array(z.object({
    field: z.string(),
    label: z.string().optional(),
  })).optional(),
  sections: z.array(z.object({
    title: z.string(),
    fields: z.array(z.object({
      field: z.string(),
      required: z.boolean().optional(),
    })),
  })).optional(),
  actions: z.array(z.string()).optional(),
  pageSize: z.number().optional(),
}).passthrough();

export const viewDefinitionSchema = z.object({
  object: z.string(),
  key: z.string(),
  type: z.enum(["list", "form"]),
  label: z.string(),
  config: viewConfigSchema,
});

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
  ]).optional(),
  audience: z.array(z.string()).optional(),
});

export type ModulePresentation = z.infer<typeof modulePresentationSchema>;

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
    })).optional(),
  }).optional(),
  presentation: modulePresentationSchema.optional(),
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
});
export type PackPermissionGroup = z.infer<typeof packPermissionGroupSchema>;

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
}

export interface WorkflowEvent {
  id: string;
  instanceId: string;
  sequence: number;
  eventType: string;
  stepId: string | null;
  actorType: string | null;
  actorId: string | null;
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
