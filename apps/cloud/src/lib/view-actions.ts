import type { ViewAction } from "@runory/contracts";

/**
 * Filter view actions by the user's effective permissions.
 * Actions without a permission requirement are always shown.
 * Actions with a permission are shown only if the user has it (or has "*").
 */
export function filterActionsByPermission(
  actions: ViewAction[],
  permissions: Set<string>,
): ViewAction[] {
  return actions.filter((action) => {
    if (!action.permission) return true;
    return permissions.has("*") || permissions.has(action.permission);
  });
}

/**
 * Resolve the display label for a view action.
 * Falls back to a capitalized version of the action key.
 */
export function resolveActionLabel(action: ViewAction): string {
  if (action.label) return action.label;
  return action.key.charAt(0).toUpperCase() + action.key.slice(1);
}

/** CSS class for an action button based on its tone. */
export function actionToneClass(tone?: "primary" | "secondary" | "danger"): string {
  switch (tone) {
    case "primary": return "app-button-primary";
    case "danger": return "app-button-secondary text-red-600 hover:text-red-700 border-red-200 hover:border-red-300";
    default: return "app-button-secondary";
  }
}

/**
 * Extract typed ViewAction[] from a raw view config object.
 * The backend already normalizes string actions to objects, but we guard
 * against untyped access for safety.
 */
export function extractViewActions(config: Record<string, unknown> | null): ViewAction[] {
  if (!config || !Array.isArray(config.actions)) return [];
  return config.actions as ViewAction[];
}
