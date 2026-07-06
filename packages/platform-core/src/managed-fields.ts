// ── Managed Field Registry (v0.5.1 P0) ──
//
// Per v0.5.1 P0 requirement "GOVERNED_FIELD_REQUIRES_COMMAND":
// generic CRUD on managed lifecycle fields returns 409 GOVERNED_FIELD_REQUIRES_COMMAND.
// UI / API / automation / MCP / future Agents all call the same command directory.
//
// Managed fields can ONLY be changed via named commands, not via generic record
// CRUD (PUT/PATCH on the record endpoint). Non-managed descriptive / custom
// fields (description, notes, custom_*, etc.) remain freely editable via CRUD.
//
// Format: { objectKey: { fieldName: { command: string, description: string } } }
// `command` is a pipe-separated list of the named commands that are permitted
// to mutate that field, surfaced back to the caller in the 409 error message.

const MANAGED_FIELDS: Record<string, Record<string, { command: string; description: string }>> = {
  quote: {
    status: { command: "quote.submit|approve|reject|return|withdraw|mark_sent|accept|mark_declined|expire", description: "Quote lifecycle state" },
    revision_number: { command: "quote.revise", description: "Quote revision" },
    snapshot_hash: { command: "quote.lock", description: "Quote snapshot" },
  },
  work_order: {
    status: { command: "work_order.start|complete|cancel|reopen", description: "Work order lifecycle state" },
  },
  visit: {
    status: { command: "visit.start_travel|arrive|complete|cancel|reopen", description: "Visit lifecycle state" },
  },
  deal: {
    stage: { command: "deal.advance", description: "Deal stage progression" },
  },
};

/**
 * Get the full managed-field map for an object type.
 * Returns an empty object when the object type has no managed fields.
 */
export function getManagedFields(objectKey: string): Record<string, { command: string; description: string }> {
  return MANAGED_FIELDS[objectKey] ?? {};
}

/**
 * Check whether a field is managed for the given object type.
 * Field-name comparison is case-insensitive.
 */
export function isManagedField(objectKey: string, fieldName: string): boolean {
  const fields = MANAGED_FIELDS[objectKey];
  if (!fields) return false;
  const lower = fieldName.toLowerCase();
  return Object.keys(fields).some((k) => k.toLowerCase() === lower);
}

/**
 * Get the pipe-separated command string for a managed field, or undefined if the
 * field is not managed for the given object type. Field-name comparison is
 * case-insensitive.
 */
export function getManagedFieldCommand(objectKey: string, fieldName: string): string | undefined {
  const fields = MANAGED_FIELDS[objectKey];
  if (!fields) return undefined;
  const lower = fieldName.toLowerCase();
  for (const key of Object.keys(fields)) {
    if (key.toLowerCase() === lower) {
      return fields[key].command;
    }
  }
  return undefined;
}
