// ── System Command Executor Registration: Quote Module ──
//
// Registers executors for system_command workflow steps that are bound to
// quote commands. Each executor reads the current aggregate version and
// invokes the corresponding command with a system actor.
//
// This file is the quote module's contribution to the workflow engine's
// system_command registry. The workflow engine itself (workflow.ts) is
// domain-agnostic and does not import quote-commands directly.

import { queryOne } from "../db";
import { businessTable } from "../contracts";
import { NotFoundError } from "../context";
import { approveQuote, rejectQuote } from "../quote-commands";
import { registerSystemCommandExecutor } from "../workflow";

registerSystemCommandExecutor("quote.approve", async (workspaceId, subjectId) => {
  const quote = await queryOne<{ aggregate_version: number }>(
    `SELECT aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, subjectId],
  );
  if (!quote) throw new NotFoundError(`Quote not found: ${subjectId}`);
  await approveQuote(workspaceId, subjectId, { id: "system", type: "system" }, quote.aggregate_version);
});

registerSystemCommandExecutor("quote.reject", async (workspaceId, subjectId) => {
  const quote = await queryOne<{ aggregate_version: number }>(
    `SELECT aggregate_version FROM ${businessTable("quote")} WHERE workspace_id = ? AND id = ?`,
    [workspaceId, subjectId],
  );
  if (!quote) throw new NotFoundError(`Quote not found: ${subjectId}`);
  await rejectQuote(
    workspaceId,
    subjectId,
    { id: "system", type: "system" },
    quote.aggregate_version,
    "Rejected by workflow",
  );
});
