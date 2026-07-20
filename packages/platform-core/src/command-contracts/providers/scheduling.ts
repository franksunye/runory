import { TABLES } from "../../contracts";
import { queryOne } from "../../db";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

registerCommandEffectProvider({
  capability: "scheduling.complete_reservation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const active = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('tentative', 'confirmed')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    const count = active?.count ?? 0;
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      count,
      "active Schedule reservation(s)",
    );
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${TABLES.scheduleEntries}
              SET status = 'completed', version = version + 1, updated_at = ?
              WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
                AND status IN ('tentative', 'confirmed')`,
        args: [
          envelope.occurredAt,
          envelope.workspaceId,
          envelope.aggregateType,
          envelope.aggregateId,
        ],
        expectedRowsAffected: count,
      }],
    };
  },
});

registerCommandEffectProvider({
  capability: "scheduling.cancel_reservation",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.scheduleEntries}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('tentative', 'confirmed')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Schedule reservation(s)",
    );
    const count = row?.count ?? 0;
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${TABLES.scheduleEntries}
              SET status = 'cancelled', version = version + 1, updated_at = ?
              WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
                AND status IN ('tentative', 'confirmed')`,
        args: [
          envelope.occurredAt,
          envelope.workspaceId,
          envelope.aggregateType,
          envelope.aggregateId,
        ],
        expectedRowsAffected: count,
      }],
    };
  },
});
