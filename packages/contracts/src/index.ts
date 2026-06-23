import { z } from "zod";

// ── Field Types ──
export const fieldTypes = ["text", "email", "phone", "number", "date", "select", "boolean"] as const;
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

export const moduleManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  manifestSchemaVersion: z.string().default("1.0.0"),
  publisher: z.string().optional(),
  coreCompatibility: z.string(),
  releaseCompatibility: releaseCompatibilitySchema.optional(),
  dependencies: z.array(z.string()).optional(),
  objects: z.array(objectDefinitionSchema),
  views: z.array(viewDefinitionSchema),
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
  extensionPoints: extensionPointSchema.optional(),
  upgradePolicy: z.object({
    supportsWorkspaceExtensions: z.boolean().default(true),
    breakingChangePolicy: z.string().default("manual_review"),
  }).optional(),
  dataOwnership: z.string().default("workspace"),
  uninstallRetentionPolicy: z.string().default("retain_data"),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

// ── Pack Manifest ──
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
  marketplace: z.object({
    category: z.string(),
    license: z.string(),
    publisher: z.string(),
  }).optional(),
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

// ── Workflow Runtime ──
export const workflowConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "in"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const workflowTransitionSchema = z.object({
  fromStatus: z.string(),
  toStatus: z.string(),
  label: z.string(),
  // If conditions met, auto-suggest this transition
  conditions: z.array(workflowConditionSchema).optional(),
  // If true, requires approver
  requiresApproval: z.boolean().default(false),
  // Role required to execute this transition
  requiredRole: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const workflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetObject: z.string(),
  initialState: z.string(),
  states: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(["initial", "intermediate", "approved", "rejected", "final"]).default("intermediate"),
  })),
  transitions: z.array(workflowTransitionSchema),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;

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
