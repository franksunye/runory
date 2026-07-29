/**
 * Extension Template Library (v0.9.1)
 *
 * Provides a catalog of pre-built extension templates that can be applied
 * to any workspace. Each template defines a common customization pattern
 * (e.g., adding a loyalty tier field, a work order priority filter) as a
 * declarative ExtensionPlan.
 *
 * Templates are stored as JSON files in catalog/extension-templates/ and
 * are loaded at runtime. This supports the v0.9.1 repeatability goal by
 * providing a library of known-good extensions that can be applied without
 * writing custom code.
 *
 * Design principles:
 * - Declarative: templates are JSON, not code
 * - Validated: templates are parsed against the ExtensionPlan schema
 * - Reusable: the same template can be applied to any compatible workspace
 * - Safe: applying a template uses the existing extension validation pipeline
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { applyExtension, validateExtensionPlan } from "./extension";
import type {
  ExtensionTemplate,
  ExtensionTemplateSummary,
} from "@runory/contracts";
import type { ActorIdentity } from "./tenancy";

// ── Resource Directory Resolution ──

function extensionTemplatesDir(): string {
  const candidates = [
    resolve(process.cwd(), ".resources", "catalog", "extension-templates"),
    resolve(process.cwd(), "catalog", "extension-templates"),
    resolve(process.cwd(), "..", "..", "catalog", "extension-templates"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `Extension templates directory not found (tried: ${candidates.join(", ")})`,
  );
}

// ── Template Loading ──

/**
 * Load a single extension template by ID.
 * Returns undefined if the template does not exist.
 */
export function loadExtensionTemplate(templateId: string): ExtensionTemplate | undefined {
  const dir = extensionTemplatesDir();
  const filePath = join(dir, `${templateId}.json`);
  if (!existsSync(filePath)) return undefined;

  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ExtensionTemplate;
}

/**
 * List all available extension templates.
 * Returns summaries (without the full plan) for lightweight listing.
 */
export function listExtensionTemplates(): ExtensionTemplateSummary[] {
  const dir = extensionTemplatesDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  const templates: ExtensionTemplateSummary[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      const template = JSON.parse(raw) as ExtensionTemplate;

      templates.push({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        targetSolutionTypes: template.targetSolutionTypes ?? [],
        riskLevel: template.riskLevel,
        customFieldCount: template.plan.customFields?.length ?? 0,
        viewModificationCount: template.plan.viewModifications?.length ?? 0,
      });
    } catch {
      // Skip malformed templates
    }
  }

  return templates.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

/**
 * List extension templates filtered by category.
 */
export function listExtensionTemplatesByCategory(category: string): ExtensionTemplateSummary[] {
  return listExtensionTemplates().filter((t) => t.category === category);
}

/**
 * List extension templates compatible with a given solution type.
 */
export function listExtensionTemplatesForSolution(solutionType: string): ExtensionTemplateSummary[] {
  return listExtensionTemplates().filter(
    (t) => t.targetSolutionTypes.length === 0 || t.targetSolutionTypes.includes(solutionType),
  );
}

// ── Template Application ──

/**
 * Apply an extension template to a workspace.
 *
 * This loads the template, validates it against the workspace's current
 * configuration, and applies it using the standard extension pipeline.
 * The applied extension can be rolled back using the existing rollback mechanism.
 */
export async function applyExtensionTemplate(
  workspaceId: string,
  templateId: string,
  actor: ActorIdentity,
): Promise<{
  templateId: string;
  templateName: string;
  extensionId: string;
  version: number;
  applied: boolean;
  validationErrors: string[];
}> {
  const template = loadExtensionTemplate(templateId);
  if (!template) {
    throw new Error(`Extension template not found: ${templateId}`);
  }

  // Validate the extension plan against the workspace
  const validation = await validateExtensionPlan(workspaceId, template.plan);
  if (!validation.valid) {
    return {
      templateId,
      templateName: template.name,
      extensionId: "",
      version: 0,
      applied: false,
      validationErrors: validation.errors,
    };
  }

  // Apply the extension
  const result = await applyExtension(workspaceId, template.plan, actor.externalId);

  return {
    templateId,
    templateName: template.name,
    extensionId: result.extensionId,
    version: result.version,
    applied: true,
    validationErrors: [],
  };
}

/**
 * Preview an extension template against a workspace without applying it.
 * Returns the diff that would be applied.
 */
export async function previewExtensionTemplate(
  workspaceId: string,
  templateId: string,
) {
  const template = loadExtensionTemplate(templateId);
  if (!template) {
    throw new Error(`Extension template not found: ${templateId}`);
  }

  // Use the existing previewExtension function
  const { previewExtension } = await import("./extension");
  const preview = await previewExtension(workspaceId, template.plan);

  return {
    templateId,
    templateName: template.name,
    description: template.description,
    riskLevel: template.riskLevel,
    preview,
  };
}
