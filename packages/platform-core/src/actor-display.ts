// Server-side actor resolution for event trails and work-item cards.
// Raw platform ids must never reach a reader, so every surface that shows
// "who did this" resolves through here.

import { queryAll } from "./db";
import { TABLES } from "./contracts";

export interface ActorDisplay {
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Batch-load display names for actor references. Actor columns hold either the
 * internal user id or the external identity id depending on which surface wrote
 * the row, so the returned map is keyed by both.
 */
export async function resolveActorDisplays(
  refs: Array<string | null | undefined>
): Promise<Map<string, ActorDisplay>> {
  const unique = [...new Set(refs.filter((ref): ref is string => Boolean(ref)))];
  const displays = new Map<string, ActorDisplay>();
  if (unique.length === 0) return displays;

  const placeholders = unique.map(() => "?").join(",");
  const rows = await queryAll<{
    id: string;
    external_id: string;
    display_name: string;
    avatar_url: string | null;
  }>(
    `SELECT id, external_id, display_name, avatar_url FROM ${TABLES.users}
     WHERE id IN (${placeholders}) OR external_id IN (${placeholders})`,
    [...unique, ...unique]
  );

  for (const row of rows) {
    if (!row.display_name) continue;
    const display: ActorDisplay = { displayName: row.display_name, avatarUrl: row.avatar_url };
    displays.set(row.id, display);
    displays.set(row.external_id, display);
  }
  return displays;
}
