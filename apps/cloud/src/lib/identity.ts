import "server-only";

import { queryAll, TABLES } from "@runory/platform-core";

export interface WorkspacePersonOption {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

export async function listWorkspacePeople(
  workspaceId: string,
  organizationId: string | null
): Promise<WorkspacePersonOption[]> {
  return queryAll<{ id: string; display_name: string; email: string | null; avatar_url: string | null }>(
    `SELECT DISTINCT u.id, u.display_name, u.email, u.avatar_url
     FROM ${TABLES.users} u
     LEFT JOIN ${TABLES.workspaceMemberships} wm
       ON wm.user_id = u.id AND wm.workspace_id = ? AND wm.status = 'active'
     LEFT JOIN ${TABLES.organizationMemberships} om
       ON om.user_id = u.id AND om.organization_id = ? AND om.status = 'active'
     WHERE wm.id IS NOT NULL OR om.id IS NOT NULL
     ORDER BY u.display_name ASC`,
    [workspaceId, organizationId ?? ""]
  ).then((rows) => rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
  })));
}

export async function enrichUserReferences<T extends Record<string, unknown>>(
  records: T[],
  fieldKeys: string[] = ["owner"]
): Promise<T[]> {
  const ids = [...new Set(records.flatMap((record) =>
    fieldKeys
      .map((fieldKey) => record[fieldKey])
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  ))];
  if (ids.length === 0) return records;

  const placeholders = ids.map(() => "?").join(",");
  const people = await queryAll<{ id: string; external_id: string; display_name: string; email: string | null; avatar_url: string | null }>(
    `SELECT id, external_id, display_name, email, avatar_url
     FROM ${TABLES.users}
     WHERE id IN (${placeholders}) OR external_id IN (${placeholders})`,
    [...ids, ...ids]
  );
  const labels = new Map<string, string>();
  const avatars = new Map<string, string>();
  for (const person of people) {
    labels.set(person.id, person.display_name);
    labels.set(person.external_id, person.display_name);
    if (person.email) labels.set(person.email, person.display_name);
    if (person.avatar_url) {
      avatars.set(person.id, person.avatar_url);
      avatars.set(person.external_id, person.avatar_url);
      if (person.email) avatars.set(person.email, person.avatar_url);
    }
  }

  return records.map((record) => {
    const enriched: Record<string, unknown> = { ...record };
    for (const fieldKey of fieldKeys) {
      const value = record[fieldKey];
      if (typeof value === "string" && labels.has(value)) {
        enriched[`${fieldKey}_display`] = labels.get(value);
        enriched[`${fieldKey}_avatar_url`] = avatars.get(value) ?? null;
      }
    }
    return enriched as T;
  });
}

/** Resolve every metadata-defined User field for an object. */
export async function listUserReferenceFieldKeys(
  workspaceId: string,
  objectKey: string
): Promise<string[]> {
  const rows = await queryAll<{ field_key: string }>(
    `SELECT field_key FROM ${TABLES.fieldDefinitions}
     WHERE workspace_id = ? AND object_key = ? AND type = 'user'
     ORDER BY field_key`,
    [workspaceId, objectKey]
  );
  return rows.map((row) => row.field_key);
}
