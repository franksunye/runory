// Server-side subject enrichment for My Work / workflow cards.
// Keeps every consumer (desktop, mobile, RecordWorkflowPanel) consistent.

import { queryAll } from "./db";
import { businessTable } from "./contracts";

export interface WorkItemSubjectRef {
  subject_type: string | null;
  subject_id: string | null;
}

export interface WorkItemSubjectEnrichment {
  title: string | null;
  company_name: string | null;
  site_name: string | null;
  quote_number: string | null;
  amount_minor: number | null;
  currency: string | null;
}

function subjectKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function isUsableLabel(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Never surface raw platform IDs as titles.
  if (/^(usr_|res_|rec_|wi_|wo_|qte_|sv_)/i.test(trimmed)) return false;
  return true;
}

/**
 * Batch-load display fields for work-item subjects (quote / visit / work order).
 * Returns a map keyed by `${subject_type}:${subject_id}`.
 */
export async function enrichWorkItemSubjects(
  workspaceId: string,
  items: WorkItemSubjectRef[],
): Promise<Map<string, WorkItemSubjectEnrichment>> {
  const result = new Map<string, WorkItemSubjectEnrichment>();

  const quoteIds = new Set<string>();
  const visitIds = new Set<string>();
  const workOrderIds = new Set<string>();

  for (const item of items) {
    if (!item.subject_type || !item.subject_id) continue;
    if (item.subject_type === "quote") quoteIds.add(item.subject_id);
    else if (item.subject_type === "service_visit") visitIds.add(item.subject_id);
    else if (item.subject_type === "work_order") workOrderIds.add(item.subject_id);
  }

  if (quoteIds.size > 0) {
    const placeholders = [...quoteIds].map(() => "?").join(", ");
    const rows = await queryAll<{
      id: string;
      quote_number: string | null;
      title: string | null;
      grand_total: number | null;
      currency: string | null;
      company_name: string | null;
    }>(
      `SELECT q.id,
              q.quote_number,
              q.title,
              q.grand_total,
              q.currency,
              c.name AS company_name
       FROM ${businessTable("quote")} q
       LEFT JOIN ${businessTable("company")} c
         ON c.workspace_id = q.workspace_id AND c.id = q.company_id
       WHERE q.workspace_id = ? AND q.id IN (${placeholders})`,
      [workspaceId, ...quoteIds],
    );
    for (const row of rows) {
      result.set(subjectKey("quote", row.id), {
        title: isUsableLabel(row.title) ? row.title.trim() : null,
        company_name: isUsableLabel(row.company_name) ? row.company_name.trim() : null,
        site_name: null,
        quote_number: isUsableLabel(row.quote_number) ? row.quote_number.trim() : null,
        amount_minor: row.grand_total ?? null,
        currency: row.currency ?? null,
      });
    }
  }

  if (visitIds.size > 0) {
    const placeholders = [...visitIds].map(() => "?").join(", ");
    const rows = await queryAll<{
      id: string;
      visit_title: string | null;
      wo_title: string | null;
      company_name: string | null;
      site_name: string | null;
    }>(
      `SELECT v.id,
              v.title AS visit_title,
              wo.title AS wo_title,
              c.name AS company_name,
              s.name AS site_name
       FROM ${businessTable("service_visit")} v
       LEFT JOIN ${businessTable("work_order")} wo
         ON wo.workspace_id = v.workspace_id AND wo.id = v.work_order_id
       LEFT JOIN ${businessTable("company")} c
         ON c.workspace_id = wo.workspace_id AND c.id = wo.company_id
       LEFT JOIN ${businessTable("service_site")} s
         ON s.workspace_id = wo.workspace_id AND s.id = wo.service_site_id
       WHERE v.workspace_id = ? AND v.id IN (${placeholders})`,
      [workspaceId, ...visitIds],
    );
    for (const row of rows) {
      const visitTitle = isUsableLabel(row.visit_title) ? row.visit_title.trim() : null;
      const woTitle = isUsableLabel(row.wo_title) ? row.wo_title.trim() : null;
      result.set(subjectKey("service_visit", row.id), {
        title: visitTitle ?? woTitle,
        company_name: isUsableLabel(row.company_name) ? row.company_name.trim() : null,
        site_name: isUsableLabel(row.site_name) ? row.site_name.trim() : null,
        quote_number: null,
        amount_minor: null,
        currency: null,
      });
    }
  }

  if (workOrderIds.size > 0) {
    const placeholders = [...workOrderIds].map(() => "?").join(", ");
    const rows = await queryAll<{
      id: string;
      title: string | null;
      company_name: string | null;
      site_name: string | null;
    }>(
      `SELECT wo.id,
              wo.title,
              c.name AS company_name,
              s.name AS site_name
       FROM ${businessTable("work_order")} wo
       LEFT JOIN ${businessTable("company")} c
         ON c.workspace_id = wo.workspace_id AND c.id = wo.company_id
       LEFT JOIN ${businessTable("service_site")} s
         ON s.workspace_id = wo.workspace_id AND s.id = wo.service_site_id
       WHERE wo.workspace_id = ? AND wo.id IN (${placeholders})`,
      [workspaceId, ...workOrderIds],
    );
    for (const row of rows) {
      result.set(subjectKey("work_order", row.id), {
        title: isUsableLabel(row.title) ? row.title.trim() : null,
        company_name: isUsableLabel(row.company_name) ? row.company_name.trim() : null,
        site_name: isUsableLabel(row.site_name) ? row.site_name.trim() : null,
        quote_number: null,
        amount_minor: null,
        currency: null,
      });
    }
  }

  return result;
}

export function lookupSubjectEnrichment(
  map: Map<string, WorkItemSubjectEnrichment>,
  subjectType: string | null,
  subjectId: string | null,
): WorkItemSubjectEnrichment | null {
  if (!subjectType || !subjectId) return null;
  return map.get(subjectKey(subjectType, subjectId)) ?? null;
}
