import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { writeAuditEvent } from "./audit-service";
import { businessTable } from "./contracts";
import { execute, now, queryAll, queryOne } from "./db";
import { createRecord, getRecord, getRecords, updateRecord } from "./metadata";
import { enqueueOutboxMessage } from "./outbox";
import { createConversation, createNotificationMessage } from "./messaging";

export type Urgency = "low" | "medium" | "high" | "urgent";
export type VoiceCallStatus = "initiated" | "ringing" | "answered" | "ended" | "analyzed" | "failed";

export interface ServiceIntakeInput {
  providerCallId: string;
  callerPhone: string;
  contactName?: string;
  customerEmail?: string;
  serviceAddress?: string;
  serviceCategory?: string;
  issueDescription?: string;
  urgency?: Urgency;
  selectedSlotId?: string;
  confirmedFields?: string[];
}

export interface VoiceActor {
  provider: "retell";
  providerCallId: string;
  integrationPrincipalId: string;
}

function voiceActorLabel(actor: VoiceActor): string {
  return `Runory Voice Intake (${actor.provider})`;
}

async function recordVoiceCreationActivity(
  workspaceId: string,
  actor: VoiceActor,
  entityType: string,
  entity: Record<string, unknown>,
  details: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent({
    workspaceId,
    actorType: "agent",
    actorId: voiceActorLabel(actor),
    action: "record.create",
    entityType,
    entityId: String(entity.id),
    // Keep the feed useful without duplicating the complete caller payload.
    after: { id: entity.id, ...details, createdBy: actor.integrationPrincipalId },
  });
}

const REQUIRED_FIELDS: Array<keyof ServiceIntakeInput> = [
  "callerPhone", "contactName", "serviceAddress", "serviceCategory", "issueDescription", "urgency",
];
const CONFIRM_FIELDS: Array<keyof ServiceIntakeInput> = ["serviceAddress", "serviceCategory", "urgency"];
const STATUS_ORDER: Record<VoiceCallStatus, number> = {
  initiated: 0, ringing: 1, answered: 2, ended: 3, analyzed: 4, failed: 4,
};

export function normalizeE164(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("VOICE_INVALID_PHONE");
}

export function verifyRetellSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!signature || !secret) return false;
  const match = /^v=(\d+),d=([a-f\d]+)$/i.exec(signature);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${rawBody}${match[1]}`).digest("hex");
  const supplied = match[2];
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

async function replay<T>(workspaceId: string, key: string): Promise<T | undefined> {
  const row = await queryOne<{ result_json: string }>(
    "SELECT result_json FROM voice_intake_idempotency WHERE workspace_id = ? AND idempotency_key = ?",
    [workspaceId, key],
  );
  return row ? JSON.parse(row.result_json) as T : undefined;
}

async function remember(workspaceId: string, key: string, operation: string, result: unknown): Promise<void> {
  await execute(
    "INSERT INTO voice_intake_idempotency (workspace_id, idempotency_key, operation, result_json, created_at) VALUES (?, ?, ?, ?, ?)",
    [workspaceId, key, operation, JSON.stringify(result), now()],
  );
}

export async function resolveVoiceWorkspace(providerResourceId: string): Promise<{ workspaceId: string; principalId: string }> {
  const row = await queryOne<{ workspace_id: string; id: string }>(
    `SELECT workspace_id, id FROM ${businessTable("voice_provider_reference")}
     WHERE provider = 'retell' AND provider_resource_id = ? AND status = 'active' LIMIT 1`,
    [providerResourceId],
  );
  if (!row) throw new Error("VOICE_WORKSPACE_NOT_MAPPED");
  return { workspaceId: row.workspace_id, principalId: `integration:${row.id}` };
}

export async function upsertVoiceCall(workspaceId: string, input: {
  providerCallId: string; callerPhone: string; calleePhone?: string; providerPhoneId?: string;
}): Promise<Record<string, unknown>> {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider = 'retell' AND provider_call_id = ?`,
    [workspaceId, input.providerCallId],
  );
  if (existing) return existing;
  return createRecord(workspaceId, "voice_call", {
    provider: "retell",
    provider_call_id: input.providerCallId,
    provider_phone_id: input.providerPhoneId,
    caller_phone: normalizeE164(input.callerPhone),
    callee_phone: input.calleePhone ? normalizeE164(input.calleePhone) : undefined,
    status: "initiated",
    outcome: "pending",
    review_status: "unreviewed",
    last_event_sequence: 0,
  });
}

export async function ingestVoiceEvent(workspaceId: string, event: {
  eventId: string; providerCallId: string; eventType: string; status: VoiceCallStatus;
  sequence?: number; startedAt?: string; answeredAt?: string; endedAt?: string;
  durationSeconds?: number; transcript?: string; summary?: string; recordingReference?: string;
  payload?: unknown;
}): Promise<{ duplicate: boolean; callId: string }> {
  const duplicate = await queryOne<{ provider_event_id: string }>(
    "SELECT provider_event_id FROM voice_intake_provider_events WHERE workspace_id = ? AND provider = 'retell' AND provider_event_id = ?",
    [workspaceId, event.eventId],
  );
  const call = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider = 'retell' AND provider_call_id = ?`,
    [workspaceId, event.providerCallId],
  );
  if (!call) throw new Error("VOICE_CALL_NOT_FOUND");
  if (duplicate) return { duplicate: true, callId: String(call.id) };

  await execute(
    "INSERT INTO voice_intake_provider_events (workspace_id, provider, provider_event_id, provider_call_id, event_type, sequence_number, received_at, payload_json) VALUES (?, 'retell', ?, ?, ?, ?, ?, ?)",
    [workspaceId, event.eventId, event.providerCallId, event.eventType, event.sequence ?? 0, now(), JSON.stringify(event.payload ?? {})],
  );

  const current = String(call.status) as VoiceCallStatus;
  const next = STATUS_ORDER[event.status] >= STATUS_ORDER[current] ? event.status : current;
  await updateRecord(workspaceId, "voice_call", String(call.id), {
    status: next,
    started_at: event.startedAt ?? call.started_at,
    answered_at: event.answeredAt ?? call.answered_at,
    ended_at: event.endedAt ?? call.ended_at,
    duration_seconds: event.durationSeconds ?? call.duration_seconds,
    transcript_text: event.transcript ?? call.transcript_text,
    summary: event.summary ?? call.summary,
    recording_reference: event.recordingReference ?? call.recording_reference,
    review_status: event.status === "failed" ? "needs_review" : call.review_status,
    outcome: event.status === "failed" ? "failed" : call.outcome,
    last_event_sequence: Math.max(Number(call.last_event_sequence ?? 0), event.sequence ?? 0),
  });
  return { duplicate: false, callId: String(call.id) };
}

export async function lookupCaller(workspaceId: string, callerPhone: string, hints?: {
  contactName?: string;
  serviceAddress?: string;
}) {
  const phone = normalizeE164(callerPhone);
  const contacts = await getRecords(workspaceId, "contact", { filters: { phone } });
  let candidate = contacts[0];
  let candidateSites: Record<string, unknown>[] = [];

  // Phone remains the primary identity.  When a caller uses a different number,
  // reuse CRM data only when both their spoken name and service address match.
  // This avoids attaching a job to an unrelated customer with the same name.
  if (!candidate && hints?.contactName && hints.serviceAddress) {
    const namedContacts = await getRecords(workspaceId, "contact", { filters: { name: hints.contactName } });
    for (const namedContact of namedContacts) {
      const sites = await getRecords(workspaceId, "service_site", {
        filters: { primary_contact_id: String(namedContact.id) },
        limit: 20,
      });
      const addressMatch = sites.filter(site => site.address === hints.serviceAddress);
      if (addressMatch.length > 0) {
        candidate = namedContact;
        candidateSites = addressMatch;
        break;
      }
    }
  }
  const sites = candidate
    ? (candidateSites.length > 0 ? candidateSites : await getRecords(workspaceId, "service_site", { filters: { primary_contact_id: String(candidate.id) }, limit: 5 }))
    : [];
  const openWork = candidate
    ? await queryAll<Record<string, unknown>>(
        `SELECT id, title, status, service_site_id FROM ${businessTable("work_order")}
         WHERE workspace_id = ? AND contact_id = ? AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 5`,
        [workspaceId, candidate.id],
      )
    : [];
  return {
    matched: Boolean(candidate),
    contact: candidate ? { id: candidate.id, name: candidate.name } : null,
    sites: sites.map(site => ({ id: site.id, name: site.name, address: site.address })),
    openWorkCount: openWork.length,
  };
}

export async function previewServiceIntake(workspaceId: string, input: ServiceIntakeInput) {
  const callerPhone = normalizeE164(input.callerPhone);
  const missingFields = REQUIRED_FIELDS.filter(field => !input[field]);
  const confirmed = new Set(input.confirmedFields ?? []);
  const requiresConfirmation = CONFIRM_FIELDS.filter(field => input[field] && !confirmed.has(String(field)));
  const caller = await lookupCaller(workspaceId, callerPhone, input);
  const call = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider = 'retell' AND provider_call_id = ?`,
    [workspaceId, input.providerCallId],
  );
  if (!call) throw new Error("VOICE_CALL_NOT_FOUND");

  const duplicateCandidates = input.issueDescription
    ? await queryAll<Record<string, unknown>>(
        `SELECT id, title, status FROM ${businessTable("work_order")}
         WHERE workspace_id = ? AND status NOT IN ('completed','cancelled') AND description LIKE ? LIMIT 5`,
        [workspaceId, `%${input.issueDescription.slice(0, 48)}%`],
      )
    : [];

  let session = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("voice_intake_session")} WHERE workspace_id = ? AND voice_call_id = ?`,
    [workspaceId, call.id],
  );
  const values = { ...input, callerPhone };
  const payload = {
    voice_call_id: call.id,
    schema_key: "home-service-basic",
    schema_version: 1,
    status: missingFields.length || requiresConfirmation.length ? "collecting" : "ready",
    confirmed_values_json: JSON.stringify(values),
    inferred_values_json: JSON.stringify({ candidateContactId: caller.contact?.id ?? null, candidateServiceSiteId: caller.sites[0]?.id ?? null }),
    missing_fields_json: JSON.stringify(missingFields),
    conflicts_json: "[]",
    warnings_json: JSON.stringify(duplicateCandidates.length ? ["possible_duplicate_open_work"] : []),
    confirmation_state: requiresConfirmation.length ? "partially_confirmed" : "confirmed",
  };
  session = session
    ? await updateRecord(workspaceId, "voice_intake_session", String(session.id), payload)
    : await createRecord(workspaceId, "voice_intake_session", payload);
  if (!session) throw new Error("VOICE_INTAKE_SESSION_PERSIST_FAILED");

  return {
    intakeSessionId: session.id,
    candidateContactId: caller.contact?.id ?? null,
    candidateServiceSiteId: caller.sites[0]?.id ?? null,
    duplicateCandidates,
    warnings: duplicateCandidates.length ? ["possible_duplicate_open_work"] : [],
    missingFields,
    requiresConfirmation,
    nextCommands: missingFields.length || requiresConfirmation.length ? ["service_intake.preview", "service_intake.create_follow_up"] : ["service_intake.create_work_order", "service_intake.create_and_schedule"],
  };
}

async function resolveContactAndSite(workspaceId: string, input: ServiceIntakeInput) {
  const caller = await lookupCaller(workspaceId, input.callerPhone, input);
  const resolvedContact = caller.contact
    ? await getRecord(workspaceId, "contact", String(caller.contact.id))
    : await createRecord(workspaceId, "contact", {
        name: input.contactName,
        phone: normalizeE164(input.callerPhone),
        email: input.customerEmail?.trim() || undefined,
        source: "voice",
      });
  const contact = resolvedContact && input.customerEmail?.trim() && !resolvedContact.email
    ? await updateRecord(workspaceId, "contact", String(resolvedContact.id), { email: input.customerEmail.trim() })
    : resolvedContact;
  if (!contact) throw new Error("VOICE_CONTACT_RESOLUTION_FAILED");
  const matchingSite = caller.sites.find(site => site.address === input.serviceAddress);
  const site = matchingSite
    ? await getRecord(workspaceId, "service_site", String(matchingSite.id))
    : await createRecord(workspaceId, "service_site", {
        name: `${input.contactName ?? "Customer"} service site`, address: input.serviceAddress,
        primary_contact_id: contact.id, status: "active",
      });
  if (!site) throw new Error("VOICE_SITE_RESOLUTION_FAILED");
  return { contact, site };
}

export async function createVoiceWorkOrder(workspaceId: string, input: ServiceIntakeInput, actor: VoiceActor, idempotencyKey: string) {
  const prior = await replay<Record<string, unknown>>(workspaceId, idempotencyKey);
  if (prior) return prior;
  const preview = await previewServiceIntake(workspaceId, input);
  if (preview.missingFields.length || preview.requiresConfirmation.length) throw new Error("VOICE_INTAKE_NOT_CONFIRMED");
  const callerBeforeCreate = await lookupCaller(workspaceId, input.callerPhone, input);
  const { contact, site } = await resolveContactAndSite(workspaceId, input);
  const workOrder = await createRecord(workspaceId, "work_order", {
    title: `${input.serviceCategory}: ${input.issueDescription?.slice(0, 80)}`,
    description: input.issueDescription,
    status: "new",
    priority: input.urgency,
    contact_id: contact.id,
    service_site_id: site.id,
    requested_at: now(),
    source: "voice",
    source_type: "voice_call",
    source_id: input.providerCallId,
    notes: `Created automatically by ${voiceActorLabel(actor)}. Integration principal: ${actor.integrationPrincipalId}`,
    aggregate_version: 1,
  });
  const call = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider_call_id = ?`,
    [workspaceId, input.providerCallId],
  );
  if (!call) throw new Error("VOICE_CALL_NOT_FOUND");
  await updateRecord(workspaceId, "voice_call", String(call.id), {
    contact_id: contact.id, service_site_id: site.id, work_order_id: workOrder.id,
    outcome: "work_order_created", review_status: "not_required", primary_intent: input.serviceCategory,
  });
  await updateRecord(workspaceId, "voice_intake_session", String(preview.intakeSessionId), { status: "completed", completed_at: now() });
  await recordVoiceCreationActivity(workspaceId, actor, "work_order", workOrder, {
    title: workOrder.title,
    source: "voice",
    voiceCallId: input.providerCallId,
    contactId: contact.id,
    serviceSiteId: site.id,
  });
  if (!callerBeforeCreate.contact?.id) {
    await recordVoiceCreationActivity(workspaceId, actor, "contact", contact, {
      name: contact.name,
      source: "voice",
      voiceCallId: input.providerCallId,
    });
  }
  if (!callerBeforeCreate.sites.some(siteRecord => String(siteRecord.id) === String(site.id))) {
    await recordVoiceCreationActivity(workspaceId, actor, "service_site", site, {
      name: site.name,
      contactId: contact.id,
      voiceCallId: input.providerCallId,
    });
  }
  await writeAuditEvent({
    workspaceId,
    actorType: "agent",
    actorId: voiceActorLabel(actor),
    action: "record.update",
    entityType: "voice_call",
    entityId: String(call.id),
    after: {
      outcome: "work_order_created",
      workOrderId: workOrder.id,
      contactId: contact.id,
      serviceSiteId: site.id,
      createdBy: actor.integrationPrincipalId,
    },
  });
  const recipientEmail = typeof contact.email === "string" ? contact.email.trim() : "";
  const confirmation = recipientEmail
    ? await (async () => {
        const conversation = await createConversation(workspaceId, {
          contactId: String(contact.id), workOrderId: String(workOrder.id), serviceSiteId: String(site.id), voiceCallId: String(call.id), subject: String(workOrder.title ?? "Service request"),
        });
        const confirmationCode = String(workOrder.id).slice(-8).toUpperCase();
        const message = await createNotificationMessage(workspaceId, {
          conversationId: String(conversation.id), contactId: String(contact.id), workOrderId: String(workOrder.id),
          notificationType: "work_order_confirmation", channel: "email", recipientAddress: recipientEmail,
          subject: `Service request received — ${confirmationCode}`,
          bodyText: `Hi ${String(contact.name ?? "Customer")}, we received your service request and created work order ${confirmationCode}. ${String(workOrder.title)}. Our team will follow up with scheduling details.`,
          provider: "resend",
          payload: { source: "voice_intake", confirmationCode },
        });
        const outboxId = await enqueueOutboxMessage(workspaceId, "message_delivery.email", {
        to: recipientEmail,
        contactName: contact.name,
        workOrderId: workOrder.id,
        title: workOrder.title,
        priority: input.urgency,
        serviceAddress: input.serviceAddress,
          confirmationCode,
          conversationId: conversation.id,
          notificationId: message.notificationId,
          messageId: message.messageId,
          deliveryId: message.deliveryId,
        });
        return { outboxId, conversationId: conversation.id, notificationId: message.notificationId, messageId: message.messageId, deliveryId: message.deliveryId };
      })()
    : null;
  const result = { workOrderId: workOrder.id, contactId: contact.id, serviceSiteId: site.id, confirmationCode: String(workOrder.id).slice(-8).toUpperCase(), confirmationEmailOutboxId: confirmation?.outboxId ?? null, conversationId: confirmation?.conversationId ?? null, notificationId: confirmation?.notificationId ?? null, messageId: confirmation?.messageId ?? null, deliveryId: confirmation?.deliveryId ?? null };
  await remember(workspaceId, idempotencyKey, "service_intake.create_work_order", result);
  return result;
}

export async function getAvailableVoiceSlots(workspaceId: string, from = new Date(), count = 4) {
  const slots = [];
  for (let day = 1; slots.length < count && day <= 7; day += 1) {
    for (const hour of [9, 13]) {
      const starts = new Date(from); starts.setUTCDate(starts.getUTCDate() + day); starts.setUTCHours(hour, 0, 0, 0);
      const ends = new Date(starts.getTime() + 3 * 60 * 60 * 1000);
      const token = `slot_${randomUUID()}`;
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await execute(
        "INSERT INTO voice_intake_slot_tokens (workspace_id, token, starts_at, ends_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [workspaceId, token, starts.toISOString(), ends.toISOString(), expires, now()],
      );
      slots.push({ id: token, startsAt: starts.toISOString(), endsAt: ends.toISOString(), spokenLabel: starts.toLocaleString("en-US", { weekday: "long", hour: "numeric", timeZone: "UTC" }) });
      if (slots.length >= count) break;
    }
  }
  return slots;
}

export async function createAndScheduleVoiceWork(workspaceId: string, input: ServiceIntakeInput, actor: VoiceActor, idempotencyKey: string) {
  const prior = await replay<Record<string, unknown>>(workspaceId, idempotencyKey);
  if (prior) return prior;
  if (!input.selectedSlotId) throw new Error("VOICE_SLOT_REQUIRED");
  const slot = await queryOne<{ starts_at: string; ends_at: string; expires_at: string; consumed_at: string | null }>(
    "SELECT starts_at, ends_at, expires_at, consumed_at FROM voice_intake_slot_tokens WHERE workspace_id = ? AND token = ?",
    [workspaceId, input.selectedSlotId],
  );
  if (!slot || slot.consumed_at || new Date(slot.expires_at).getTime() <= Date.now()) throw new Error("VOICE_SLOT_INVALID");
  const work = await createVoiceWorkOrder(workspaceId, input, actor, `${idempotencyKey}:work-order`);
  const visit = await createRecord(workspaceId, "service_visit", {
    work_order_id: work.workOrderId, status: "scheduled", scheduled_start: slot.starts_at,
    scheduled_end: slot.ends_at, notes: "Scheduled through Voice Intake",
  });
  await execute("UPDATE voice_intake_slot_tokens SET consumed_at = ?, subject_key = ? WHERE workspace_id = ? AND token = ? AND consumed_at IS NULL", [now(), String(visit.id), workspaceId, input.selectedSlotId]);
  const call = await queryOne<Record<string, unknown>>(`SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider_call_id = ?`, [workspaceId, input.providerCallId]);
  if (call) await updateRecord(workspaceId, "voice_call", String(call.id), { service_visit_id: visit.id, outcome: "visit_scheduled" });
  const result = { ...work, serviceVisitId: visit.id, startsAt: slot.starts_at, endsAt: slot.ends_at };
  await remember(workspaceId, idempotencyKey, "service_intake.create_and_schedule", result);
  return result;
}

export async function createVoiceFollowUp(workspaceId: string, input: { providerCallId: string; reason: string; priority?: Urgency; callbackWindow?: string }, idempotencyKey: string) {
  const prior = await replay<Record<string, unknown>>(workspaceId, idempotencyKey);
  if (prior) return prior;
  const call = await queryOne<Record<string, unknown>>(`SELECT * FROM ${businessTable("voice_call")} WHERE workspace_id = ? AND provider_call_id = ?`, [workspaceId, input.providerCallId]);
  if (!call) throw new Error("VOICE_CALL_NOT_FOUND");
  const followUp = await createRecord(workspaceId, "voice_follow_up", {
    voice_call_id: call.id, contact_id: call.contact_id, work_order_id: call.work_order_id,
    reason: input.reason, priority: input.priority ?? "high", callback_window: input.callbackWindow, status: "open",
  });
  await updateRecord(workspaceId, "voice_call", String(call.id), { outcome: "follow_up_created", review_status: "needs_review" });
  const result = { followUpId: followUp.id, accepted: true };
  await remember(workspaceId, idempotencyKey, "service_intake.create_follow_up", result);
  return result;
}
