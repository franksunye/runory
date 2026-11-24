import { AuthorizationError, requireApiKeyScope, type ApiKeyScope, type Principal } from "@runory/platform-core";

/**
 * Map the existing public key scopes to bounded operations, independently of
 * the creator's Workspace role. Unknown mutations fail closed. Credential,
 * membership, billing-provider and lifecycle administration require a session;
 * an extensions key must never mint a stronger key or grant itself a role.
 */
export function workspaceApiKeyScope(method: string, pathname: string): ApiKeyScope | null {
  const match = /^\/api\/workspaces\/[^/]+(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const path = match[1] ?? "";
  if (/^\/(api-keys|access|permission-groups|integrations|lifecycle|restore|migration)(\/|$)/.test(path)) return null;
  if (["GET", "HEAD"].includes(method.toUpperCase())) return "workspace:read";
  // This bounded POST only resolves widget data; its body batches read queries.
  if (method.toUpperCase() === "POST" && path === "/widgets/batch") return "workspace:read";

  if (/^\/agent\/(plan|preview|apply|rollback)$/.test(path)
    || /^\/packs\/[^/]+\/(install|demo-data)$/.test(path)
    || /^\/extension-templates\/[^/]+\/apply$/.test(path)
    || /^\/forms\/(definitions(?:\/[^/]+)?|bindings)$/.test(path)
    || /^\/views(?:\/[^/]+)?$/.test(path)
    || /^\/automations(?:\/[^/]+)?$/.test(path)
    || path === "/workflows" || path === "/dashboard/layout") {
    return "extensions:manage";
  }
  if (/^\/objects\/[^/]+\/records(?:\/[^/]+)?$/.test(path)
    || /^\/commands\/[^/]+$/.test(path)
    || /^\/forms\/submissions(?:\/[^/]+(?:\/revise)?)?$/.test(path)
    || /^\/work-items\/[^/]+\/(claim|complete|decisions|release)$/.test(path)
    || /^\/payments\/(requests|replay-event|[^/]+\/(refunds|reconcile))$/.test(path)
    || /^\/customer-access\/grants(?:\/[^/]+\/revoke)?$/.test(path)
    || /^\/automations\/[^/]+\/run$/.test(path)
    || /^\/views\/[^/]+\/preference$/.test(path)
    || path === "/uploads") {
    return "records:write";
  }
  return null;
}

export function authorizeWorkspaceApiKey(principal: Principal, workspaceId: string, method: string, pathname: string): void {
  if (principal.authMethod !== "api_key") return;
  const scope = workspaceApiKeyScope(method, pathname);
  if (!scope) throw new AuthorizationError("This operation requires an authenticated user session");
  requireApiKeyScope(principal, scope, workspaceId);
}
