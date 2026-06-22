import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
} from "@runory/contracts";

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export interface ManifestValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
  };
}

export function validateManifest(
  manifest: unknown,
  itemType: "module" | "pack" | "template",
): ManifestValidationResult {
  const issues: ValidationIssue[] = [];
  const schema =
    itemType === "module"
      ? moduleManifestSchema
      : itemType === "pack"
        ? packManifestSchema
        : templateManifestSchema;

  const result = schema.safeParse(manifest);
  if (!result.success) {
    for (const err of result.error.issues) {
      issues.push({
        code: err.code,
        message: err.message,
        path: err.path.join("."),
        severity: "error",
      });
    }
  }

  // Additional semantic validations
  if (result.success) {
    const m = result.data as Record<string, unknown>;

    // Check semver format
    const version = m.version as string;
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
      issues.push({
        code: "INVALID_SEMVER",
        message: `Version "${version}" is not valid semver`,
        path: "version",
        severity: "error",
      });
    }

    // Check core compatibility range
    const coreCompat = m.coreCompatibility as string;
    if (coreCompat && !/[<>=]/.test(coreCompat)) {
      issues.push({
        code: "INVALID_CORE_COMPAT",
        message: `coreCompatibility "${coreCompat}" should contain a version range operator`,
        path: "coreCompatibility",
        severity: "warning",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return {
    valid: errors === 0,
    issues,
    summary: { errors, warnings },
  };
}
