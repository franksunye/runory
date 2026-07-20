import { TABLES } from "../../contracts";
import { queryOne } from "../../db";
import { registerCommandEffectProvider } from "../registry";
import { assertEffectCardinality } from "./cardinality";

registerCommandEffectProvider({
  capability: "assignment.release_subject",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, requirement }) => {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.assignments}
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('proposed', 'assigned', 'accepted')`,
      [envelope.workspaceId, envelope.aggregateType, envelope.aggregateId],
    );
    assertEffectCardinality(
      envelope.commandType,
      requirement,
      row?.count ?? 0,
      "active Assignment(s)",
    );
    const count = row?.count ?? 0;
    return {
      recordCount: count,
      statements: [{
        sql: `UPDATE ${TABLES.assignments}
              SET status = 'released', effective_to = ?, version = version + 1, updated_at = ?
              WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
                AND status IN ('proposed', 'assigned', 'accepted')`,
        args: [
          envelope.occurredAt,
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
