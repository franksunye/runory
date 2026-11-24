import { getOutboxQueueCounts, listDueOutboxMessageIds } from "@runory/platform-core";
import { CONFIRMATION_EMAIL_TYPE, deliverWorkOrderConfirmation, isConfirmationEmailConfigured } from "@/integrations/email/resend-outbox";

// Conservative replay horizon from enqueue time. External provider
// idempotency is not indefinite. Hold older work for reconciliation.
const AUTOMATIC_REPLAY_HOURS = 23;
const BATCH_SIZE = 2;

export async function runSelfHostOutboxTick() {
  const cutoff = new Date(Date.now() - AUTOMATIC_REPLAY_HOURS * 3600_000).toISOString();
  const mode = process.env.RUNORY_SELF_HOST_EMAIL_OUTBOX_ENABLED !== "1" ? "disabled"
    : isConfirmationEmailConfigured() ? "enabled" : "unconfigured";
  let accepted = 0, failed = 0, skipped = 0, attempted = 0;
  if (mode === "enabled") {
    const due = await listDueOutboxMessageIds(CONFIRMATION_EMAIL_TYPE, { createdAfter: cutoff, limit: BATCH_SIZE });
    for (const message of due) {
      attempted++;
      const result = await deliverWorkOrderConfirmation(message.workspaceId, message.id);
      if (result.delivered) accepted++;
      else if (result.skipped) skipped++;
      else failed++;
    }
  }
  const counts = await getOutboxQueueCounts(CONFIRMATION_EMAIL_TYPE, cutoff);
  return { mode, attempted, accepted, failed, skipped, emailOutstanding: counts.active,
    reviewRequired: counts.aged, otherOutstanding: counts.other, deadLetter: counts.dead };
}
