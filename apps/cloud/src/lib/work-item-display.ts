/**
 * Shared display hierarchy for My Work / workflow cards (G3 UX Batch 2).
 * Primary: who/where (Company · Site) or Quote # · Company for approvals.
 * Secondary: job/visit title when it differs from primary.
 */

export interface WorkItemDisplayFields {
  title?: string | null;
  company_name?: string | null;
  site_name?: string | null;
  quote_number?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  subject_type?: string | null;
  kind?: string | null;
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(usr_|res_|rec_|wi_|wo_|qte_|sv_)/i.test(trimmed)) return null;
  return trimmed;
}

/** Primary card title: Company · Site | Quote N · Company | title | Service visit */
export function workItemPrimaryTitle(item: WorkItemDisplayFields): string {
  const company = clean(item.company_name);
  const site = clean(item.site_name);
  const quoteNumber = clean(item.quote_number);
  const title = clean(item.title);

  if (item.subject_type === "quote" || item.kind === "approval") {
    if (quoteNumber && company) return `Quote ${quoteNumber} · ${company}`;
    if (quoteNumber) return `Quote ${quoteNumber}`;
    if (title && company) return `${title} · ${company}`;
    if (company) return company;
    if (title) return title;
    return "Quote";
  }

  if (company && site) return `${company} · ${site}`;
  if (company) return company;
  if (site) return site;
  if (title) return title;
  return "Service visit";
}

/** Secondary line when it adds info beyond the primary title. */
export function workItemSecondaryTitle(item: WorkItemDisplayFields): string | null {
  const primary = workItemPrimaryTitle(item);
  const title = clean(item.title);
  if (!title) return null;
  if (title === primary) return null;
  // Avoid repeating quote number already in primary.
  if (item.quote_number && primary.includes(item.quote_number) && title === clean(item.quote_number)) {
    return null;
  }
  if (primary.includes(title)) return null;
  return title;
}
