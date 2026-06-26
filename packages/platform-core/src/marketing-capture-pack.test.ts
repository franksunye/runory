import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, execute, genId, now, queryAll, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { TABLES, businessTable } from "./contracts";
import { installPack, loadModuleManifest, loadPackManifest } from "./installer";
import { getRecords, getNavigation, getInstallations, createRecord, updateRecord, getObject } from "./metadata";
import { moduleManifestSchema, packManifestSchema } from "@runory/contracts";
import {
  resolveEffectiveLayout,
  resolveWidgetData,
  getAvailableWidgets,
  validateModuleDashboard,
  validatePackDashboard,
} from "./dashboard";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

async function resetDatabase() {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;

  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    const name = (row as unknown as { name: string }).name;
    await db.execute({ sql: `DROP TABLE IF EXISTS "${name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

async function createTestWorkspace() {
  const ts = now();
  workspaceId = genId("ws");
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [workspaceId, "Marketing Capture Test WS", "mc-test-ws", ts, ts]
  );
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createTestWorkspace();
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 1: Marketing Capture Pack installs with all 8 modules (3 shared + 5 marketing)
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture Pack installation", () => {
  it("installs all 8 modules with correct object definitions and navigation", async () => {
    const result = await installPack(workspaceId, "marketing-capture-pack");

    expect(result.packId).toBe("marketing-capture-pack");
    expect(result.modulesInstalled.sort()).toEqual(
      [
        "runory.company",
        "runory.contact",
        "runory.deal",
        "runory.campaign",
        "runory.form",
        "runory.landing-page",
        "runory.submission",
        "runory.consent",
      ].sort()
    );
    expect(result.ddlExecuted).toBe(true);

    // Verify all 8 modules are registered as installations
    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(8);

    // Verify marketing-owned objects are created
    const marketingObjects = ["campaign", "form", "landing_page", "submission", "consent"];
    for (const objKey of marketingObjects) {
      const obj = await getObject(workspaceId, objKey);
      expect(obj).toBeDefined();
      expect(obj?.ownership).toBe("module_owned");
    }

    // Verify navigation includes marketing routes
    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/campaigns",
        "/forms",
        "/landing-pages",
        "/submissions",
        "/consents",
        "/companies",
        "/contacts",
        "/deals",
      ])
    );
  });

  it("creates business tables for all marketing objects", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    for (const objKey of ["campaign", "form", "landing_page", "submission", "consent"]) {
      const records = await getRecords(workspaceId, objKey);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("pack manifest validates against schema", async () => {
    const pack = loadPackManifest("marketing-capture-pack");
    const reparsed = packManifestSchema.parse(pack);
    expect(reparsed.id).toBe("marketing-capture-pack");
    expect(reparsed.modules).toHaveLength(8);
    expect(reparsed.dashboard?.defaultLayout).toBeDefined();
    expect(reparsed.terminology).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2: Shared module dedupe — Marketing Capture Pack reuses company/contact/deal
// from CRM Lite Pack without duplicate install.
// ─────────────────────────────────────────────────────────────────────────────

describe("shared module dedupe with CRM Lite Pack", () => {
  it("installs CRM Lite Pack then Marketing Capture Pack without duplicate shared modules", async () => {
    const crmResult = await installPack(workspaceId, "crm-lite-pack");
    expect(crmResult.modulesInstalled.sort()).toEqual(
      ["runory.company", "runory.contact", "runory.deal", "runory.task"].sort()
    );

    const mcResult = await installPack(workspaceId, "marketing-capture-pack");
    expect(mcResult.modulesInstalled.sort()).toEqual(
      [
        "runory.campaign",
        "runory.form",
        "runory.landing-page",
        "runory.submission",
        "runory.consent",
      ].sort()
    );

    const installations = await getInstallations(workspaceId);
    expect(installations).toHaveLength(9); // 4 CRM + 5 Marketing

    const moduleCounts = new Map<string, number>();
    for (const inst of installations) {
      moduleCounts.set(inst.moduleId, (moduleCounts.get(inst.moduleId) ?? 0) + 1);
    }
    for (const [, count] of moduleCounts) {
      expect(count).toBe(1);
    }
  });

  it("does not produce duplicate navigation items when both packs share modules", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "marketing-capture-pack");

    const nav = await getNavigation(workspaceId);
    const routes = nav.map((n) => n.route);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);

    expect(routes.filter((r) => r === "/companies").length).toBe(1);
    expect(routes.filter((r) => r === "/contacts").length).toBe(1);
    expect(routes.filter((r) => r === "/deals").length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3: Pack-specific terminology overlay
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture pack terminology overlay", () => {
  it("applies marketing terminology to navigation labels", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "marketing-capture-pack");

    const nav = await getNavigation(workspaceId);

    const companyNav = nav.find((n) => n.route === "/companies");
    const dealNav = nav.find((n) => n.route === "/deals");
    expect(companyNav?.label).toBe("Customer");
    expect(dealNav?.label).toBe("Opportunity");
  });

  it("does not fork the underlying object definitions", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    const company = await getObject(workspaceId, "company");
    const deal = await getObject(workspaceId, "deal");
    expect(company?.label).toBe("Company");
    expect(deal?.label).toBe("Deal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4: Cross-pack demo data references via $lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture demo data with cross-pack references", () => {
  it("seeds marketing demo data referencing companies/contacts/deals from CRM Lite Pack", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    const mcResult = await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    expect(mcResult.demoRecordsCreated).toBeGreaterThan(0);

    // Verify campaigns were created
    const campaigns = await getRecords(workspaceId, "campaign");
    expect(campaigns.length).toBe(5);
    const summerCamp = campaigns.find((c) => String(c.name).includes("Summer"));
    expect(summerCamp).toBeDefined();

    // Verify forms were created
    const forms = await getRecords(workspaceId, "form");
    expect(forms.length).toBe(4);
    const contactForm = forms.find((f) => f.slug === "contact-us");
    expect(contactForm).toBeDefined();
    expect(contactForm?.status).toBe("published");

    // Verify landing pages were created
    const landingPages = await getRecords(workspaceId, "landing_page");
    expect(landingPages.length).toBe(4);
    const summerLp = landingPages.find((lp) => lp.slug === "summer-promo");
    expect(summerLp).toBeDefined();
    expect(summerLp?.status).toBe("published");

    // Verify submissions were created with $lookup-resolved contact_id
    const submissions = await getRecords(workspaceId, "submission");
    expect(submissions.length).toBe(8);

    const convertedSub = submissions.find((s) => String(s.source_url) === "https://runory.example/p/summer-promo" && s.status === "converted");
    expect(convertedSub).toBeDefined();

    // Verify $lookup resolved contact_id
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    expect(convertedSub?.contact_id).toBe(maya?.id);

    // Verify $lookup resolved company_id
    const companies = await getRecords(workspaceId, "company");
    const acme = companies.find((c) => c.domain === "acme.example");
    expect(convertedSub?.company_id).toBe(acme?.id);

    // Verify $lookup resolved deal_id for sub-2
    const deals = await getRecords(workspaceId, "deal");
    const novaDeal = deals.find((d) => d.name === "Nova Store Rollout");
    const novaSub = submissions.find((s) => String(s.source_url).includes("hvac-maintenance") && s.status === "converted");
    expect(novaSub?.deal_id).toBe(novaDeal?.id);
  });

  it("seeds consent records with internal references to contacts and submissions", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    const consents = await getRecords(workspaceId, "consent");
    expect(consents.length).toBe(5);

    // Verify consent references contact
    const contacts = await getRecords(workspaceId, "contact");
    const maya = contacts.find((c) => c.email === "maya@acme.example");
    const marketingConsent = consents.find((c) => c.purpose === "marketing_emails" && c.status === "granted");
    expect(marketingConsent).toBeDefined();
    expect(marketingConsent?.contact_id).toBe(maya?.id);

    // Verify withdrawn consent exists
    const withdrawn = consents.find((c) => c.status === "withdrawn");
    expect(withdrawn).toBeDefined();
    expect(withdrawn?.withdrawn_at).toBeTruthy();
  });

  it("demo data is idempotent across repeated installs", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });
    const second = await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    expect(second.demoRecordsCreated).toBe(0);

    const campaigns = await getRecords(workspaceId, "campaign");
    const forms = await getRecords(workspaceId, "form");
    const submissions = await getRecords(workspaceId, "submission");
    const consents = await getRecords(workspaceId, "consent");
    expect(campaigns.length).toBe(5);
    expect(forms.length).toBe(4);
    expect(submissions.length).toBe(8);
    expect(consents.length).toBe(5);
  });

  it("includes required demo scenarios from the plan", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    const campaigns = await getRecords(workspaceId, "campaign");
    const forms = await getRecords(workspaceId, "form");
    const landingPages = await getRecords(workspaceId, "landing_page");
    const submissions = await getRecords(workspaceId, "submission");

    // Active campaign
    expect(campaigns.some((c) => c.status === "active")).toBe(true);

    // Published form
    expect(forms.some((f) => f.status === "published")).toBe(true);

    // Draft form (unpublished)
    expect(forms.some((f) => f.status === "draft")).toBe(true);

    // Published landing page
    expect(landingPages.some((lp) => lp.status === "published")).toBe(true);

    // Pending review landing page (content approval)
    expect(landingPages.some((lp) => lp.status === "pending_review")).toBe(true);

    // Unpublished landing page
    expect(landingPages.some((lp) => lp.status === "unpublished")).toBe(true);

    // New submission
    expect(submissions.some((s) => s.status === "new")).toBe(true);

    // Converted submission (created contact/deal)
    expect(submissions.some((s) => s.status === "converted")).toBe(true);

    // Spam submission
    expect(submissions.some((s) => s.status === "spam")).toBe(true);

    // Rejected submission
    expect(submissions.some((s) => s.status === "rejected")).toBe(true);

    // Submission with consent
    expect(submissions.some((s) => s.consent_given === true || s.consent_given === 1)).toBe(true);

    // Submission without consent (spam)
    expect(submissions.some((s) => s.consent_given === false || s.consent_given === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 5: Safe publishing states
// ─────────────────────────────────────────────────────────────────────────────

describe("safe publishing states", () => {
  it("supports draft → pending_review → published → unpublished lifecycle for landing pages", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    // Create draft landing page
    const draft = await createRecord(workspaceId, "landing_page", {
      title: "Test Landing Page",
      slug: "test-publishing",
      status: "draft",
      headline: "Test Headline",
    });
    expect(draft.status).toBe("draft");

    // Submit for review
    const pending = await updateRecord(workspaceId, "landing_page", draft.id, {
      status: "pending_review",
    });
    expect(pending?.status).toBe("pending_review");

    // Publish
    const published = await updateRecord(workspaceId, "landing_page", draft.id, {
      status: "published",
      published_at: "2026-06-23",
    });
    expect(published?.status).toBe("published");
    expect(published?.published_at).toBe("2026-06-23");

    // Unpublish
    const unpublished = await updateRecord(workspaceId, "landing_page", draft.id, {
      status: "unpublished",
    });
    expect(unpublished?.status).toBe("unpublished");
  });

  it("supports draft → pending_review → published → unpublished lifecycle for forms", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    const draft = await createRecord(workspaceId, "form", {
      name: "Test Form",
      slug: "test-form-publishing",
      status: "draft",
      target_object: "contact",
    });
    expect(draft.status).toBe("draft");

    const pending = await updateRecord(workspaceId, "form", draft.id, {
      status: "pending_review",
    });
    expect(pending?.status).toBe("pending_review");

    const published = await updateRecord(workspaceId, "form", draft.id, {
      status: "published",
    });
    expect(published?.status).toBe("published");

    const unpublished = await updateRecord(workspaceId, "form", draft.id, {
      status: "unpublished",
    });
    expect(unpublished?.status).toBe("unpublished");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 6: Public form submission (direct DB-level test)
// ─────────────────────────────────────────────────────────────────────────────

describe("public form submission", () => {
  it("creates submission record directly (simulating public API)", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    // Create a published form
    const form = await createRecord(workspaceId, "form", {
      name: "Public Test Form",
      slug: "public-test",
      status: "published",
      target_object: "contact",
      fields_json: '[{"key":"name","label":"Name","type":"text","required":true},{"key":"email","label":"Email","type":"text","required":true}]',
      success_message: "Submission successful",
    });

    // Simulate public submission by creating a submission record directly
    const submission = await createRecord(workspaceId, "submission", {
      form_id: form.id,
      status: "new",
      payload_json: JSON.stringify({ name: "Test User", email: "test@example.com" }),
      source_url: "https://runory.example/p/test-page",
      referrer: "https://google.com",
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0",
      consent_given: true,
      consent_text: "I agree to receive related service information",
    });

    expect(submission.id).toBeDefined();
    expect(submission.status).toBe("new");
    expect(submission.form_id).toBe(form.id);
    expect(submission.consent_given).toBe(true);
  });

  it("submission can be converted to contact (CRM integration)", async () => {
    await installPack(workspaceId, "crm-lite-pack");
    await installPack(workspaceId, "marketing-capture-pack");

    // Create a published form
    const form = await createRecord(workspaceId, "form", {
      name: "Conversion Test Form",
      slug: "conversion-test",
      status: "published",
      target_object: "contact",
    });

    // Create a submission
    const submission = await createRecord(workspaceId, "submission", {
      form_id: form.id,
      status: "new",
      payload_json: JSON.stringify({ name: "Conversion Test", email: "convert@example.com" }),
      consent_given: true,
    });

    // Create a contact from the submission
    const contact = await createRecord(workspaceId, "contact", {
      name: "Conversion Test",
      email: "convert@example.com",
      source: "form_submission",
    });

    // Link the submission to the contact
    const converted = await updateRecord(workspaceId, "submission", submission.id, {
      status: "converted",
      contact_id: contact.id,
      processed_by: "Alex",
      processed_at: "2026-06-23",
    });

    expect(converted?.status).toBe("converted");
    expect(converted?.contact_id).toBe(contact.id);

    // Verify the contact shows the submission source
    const contacts = await getRecords(workspaceId, "contact");
    const created = contacts.find((c) => c.email === "convert@example.com");
    expect(created).toBeDefined();
    expect(created?.source).toBe("form_submission");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 7: Workbench shows marketing metrics
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture workbench composition", () => {
  it("resolves effective layout with marketing widgets", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    const layout = await resolveEffectiveLayout(workspaceId);
    expect(layout.length).toBeGreaterThan(0);

    const widgetKeys = layout.map((item) => item.widgetKey);
    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "new_submissions_metric",
        "active_campaigns_metric",
        "published_forms_metric",
        "published_landing_pages_metric",
        "active_consents_metric",
        "new_submissions_trend",
        "recent_submissions_list",
        "recent_campaigns_list",
        "recent_forms_list",
        "recent_landing_pages_list",
        "recent_consents_list",
        "business_activity_feed",
      ])
    );

    const zones = new Set(layout.map((item) => item.zone));
    expect(zones.has("metrics")).toBe(true);
    expect(zones.has("trends")).toBe(true);
    expect(zones.has("lists")).toBe(true);
    expect(zones.has("activity")).toBe(true);
  });

  it("new submissions widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "submission",
      where: "status = 'new'",
    });

    // 2 submissions with status 'new' (sub-3, sub-4)
    expect(widget.count).toBe(2);
  });

  it("active campaigns widget resolves correct count", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "campaign",
      where: "status = 'active'",
    });

    // 3 active campaigns (summer-2026, hvac-awareness, referral)
    expect(widget.count).toBe(3);
  });

  it("submission status breakdown resolves correctly", async () => {
    await installPack(workspaceId, "crm-lite-pack", { includeDemoData: true });
    await installPack(workspaceId, "marketing-capture-pack", { includeDemoData: true });

    const widget = await resolveWidgetData(workspaceId, {
      kind: "group_count",
      object: "submission",
      groupBy: "status",
    });

    expect(widget.groups).toBeDefined();
    const statusMap = new Map(widget.groups!.map((g) => [g.key, g.count]));
    expect(statusMap.get("new")).toBe(2);
    expect(statusMap.get("converted")).toBe(3);
    expect(statusMap.get("processing")).toBe(1);
    expect(statusMap.get("spam")).toBe(1);
    expect(statusMap.get("rejected")).toBe(1);
  });

  it("available widgets include marketing module widgets", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    const widgets = await getAvailableWidgets(workspaceId);
    const widgetKeys = widgets.map((w) => w.widget.key);

    expect(widgetKeys).toEqual(
      expect.arrayContaining([
        "new_submissions_metric",
        "submission_status_breakdown",
        "recent_submissions_list",
        "new_submissions_trend",
        "active_campaigns_metric",
        "campaign_status_breakdown",
        "recent_campaigns_list",
        "published_forms_metric",
        "form_status_breakdown",
        "recent_forms_list",
        "published_landing_pages_metric",
        "landing_page_status_breakdown",
        "recent_landing_pages_list",
        "active_consents_metric",
        "consent_status_breakdown",
        "recent_consents_list",
      ])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 8: Cross-pack relation declarations
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture module cross-pack relation declarations", () => {
  it("runory.submission declares relations to form, landing_page, campaign, company, contact, deal", async () => {
    const manifest = loadModuleManifest("runory.submission");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(6);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining([
        "runory.form",
        "runory.landing-page",
        "runory.campaign",
        "runory.company",
        "runory.contact",
        "runory.deal",
      ])
    );
  });

  it("runory.landing-page declares relations to form and campaign", async () => {
    const manifest = loadModuleManifest("runory.landing-page");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(2);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining(["runory.form", "runory.campaign"])
    );
  });

  it("runory.consent declares relations to contact and submission", async () => {
    const manifest = loadModuleManifest("runory.consent");
    expect(manifest.relations).toBeDefined();
    expect(manifest.relations).toHaveLength(2);

    const targets = manifest.relations!.map((r) => r.targetModule);
    expect(targets).toEqual(
      expect.arrayContaining(["runory.contact", "runory.submission"])
    );
  });

  it("all marketing module manifests validate against schema", async () => {
    const moduleIds = [
      "runory.campaign",
      "runory.form",
      "runory.landing-page",
      "runory.submission",
      "runory.consent",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const reparsed = moduleManifestSchema.parse(manifest);
      expect(reparsed.id).toBe(moduleId);
      expect(reparsed.objects.length).toBeGreaterThan(0);
      expect(reparsed.migrations.install).toBeDefined();
    }
  });

  it("marketing module dashboard widgets pass validation", async () => {
    const moduleIds = [
      "runory.campaign",
      "runory.form",
      "runory.landing-page",
      "runory.submission",
      "runory.consent",
    ];

    for (const moduleId of moduleIds) {
      const manifest = loadModuleManifest(moduleId);
      const errors = validateModuleDashboard(manifest);
      expect(errors, `Module ${moduleId} dashboard errors: ${errors.join("; ")}`).toEqual([]);
    }
  });

  it("marketing pack dashboard layout passes validation", async () => {
    const pack = loadPackManifest("marketing-capture-pack");
    const errors = validatePackDashboard(pack);
    expect(errors, `Pack dashboard layout errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 9: Marketing Capture demo journey — end-to-end capture flow
// Create landing page → Add form → Publish → Submit → Convert to contact/deal
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture demo journey (end-to-end capture flow)", () => {
  it("completes the canonical marketing capture journey", async () => {
    // 1. Install Marketing Capture Pack
    await installPack(workspaceId, "marketing-capture-pack");

    // 2. Create a campaign
    const campaign = await createRecord(workspaceId, "campaign", {
      name: "New Product Launch Campaign",
      status: "active",
      source: "website",
      medium: "organic",
      start_date: "2026-06-23",
      end_date: "2026-07-23",
      budget: 10000,
      currency: "CNY",
      owner: "Alex",
    });
    expect(campaign.id).toBeDefined();

    // 3. Create a form (draft → pending_review → published)
    const formDraft = await createRecord(workspaceId, "form", {
      name: "New Product Inquiry Form",
      slug: "new-product-inquiry",
      status: "draft",
      target_object: "contact",
      fields_json: '[{"key":"name","label":"Name","type":"text","required":true},{"key":"email","label":"Email","type":"text","required":true},{"key":"company","label":"Company","type":"text"}]',
      submit_button_label: "Submit Inquiry",
      success_message: "Thank you for your inquiry, we will contact you soon.",
      campaign_id: campaign.id,
    });

    const formPending = await updateRecord(workspaceId, "form", formDraft.id, {
      status: "pending_review",
    });
    expect(formPending?.status).toBe("pending_review");

    const formPublished = await updateRecord(workspaceId, "form", formDraft.id, {
      status: "published",
    });
    expect(formPublished?.status).toBe("published");

    // 4. Create a landing page (draft → pending_review → published)
    const lpDraft = await createRecord(workspaceId, "landing_page", {
      title: "New Product Launch",
      slug: "new-product-launch",
      status: "draft",
      headline: "Brand new product, spectacular launch",
      subheadline: "Learn now, experience first",
      body_html: "<p>Our new product is officially launched, inquiries welcome.</p>",
      cta_text: "Inquire Now",
      form_id: formDraft.id,
      campaign_id: campaign.id,
      meta_description: "New Product Launch - Learn now",
    });

    const lpPending = await updateRecord(workspaceId, "landing_page", lpDraft.id, {
      status: "pending_review",
    });
    expect(lpPending?.status).toBe("pending_review");

    const lpPublished = await updateRecord(workspaceId, "landing_page", lpDraft.id, {
      status: "published",
      published_at: "2026-06-23",
    });
    expect(lpPublished?.status).toBe("published");

    // 5. Simulate anonymous form submission
    const submission = await createRecord(workspaceId, "submission", {
      form_id: formDraft.id,
      landing_page_id: lpDraft.id,
      campaign_id: campaign.id,
      status: "new",
      payload_json: JSON.stringify({
        name: "Zhang San",
        email: "zhangsan@example.com",
        company: "Zhang San Tech",
      }),
      source_url: "https://runory.example/p/new-product-launch",
      referrer: "https://google.com",
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0",
      consent_given: true,
      consent_text: "I agree to receive related service information",
    });
    expect(submission.id).toBeDefined();
    expect(submission.status).toBe("new");

    // 6. Create consent record (after creating contact)
    const contact = await createRecord(workspaceId, "contact", {
      name: "Zhang San",
      email: "zhangsan@example.com",
      source: "form_submission",
    });

    const consent = await createRecord(workspaceId, "consent", {
      contact_id: contact.id,
      purpose: "marketing_emails",
      status: "granted",
      granted_at: "2026-06-23",
      source: "form_submission",
      submission_id: submission.id,
      policy_version: "v1.0-2026",
    });
    expect(consent.id).toBeDefined();

    // 7. Convert submission to contact
    const converted = await updateRecord(workspaceId, "submission", submission.id, {
      status: "converted",
      contact_id: contact.id,
      processed_by: "Alex",
      processed_at: "2026-06-23",
    });
    expect(converted?.status).toBe("converted");
    expect(converted?.contact_id).toBe(contact.id);

    // 8. Verify workbench reflects the new submission
    const newCount = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "submission",
      where: "status = 'new'",
    });
    expect(newCount.count).toBe(0); // The one we created is now converted

    // 9. Verify the converted submission appears in recent list
    const recentSubs = await resolveWidgetData(workspaceId, {
      kind: "recent",
      object: "submission",
      orderBy: "created_at desc",
      limit: 5,
    });
    expect(recentSubs.records).toBeDefined();
    expect(recentSubs.records!.length).toBe(1);

    // 10. Verify active campaign count
    const activeCampaigns = await resolveWidgetData(workspaceId, {
      kind: "count",
      object: "campaign",
      where: "status = 'active'",
    });
    expect(activeCampaigns.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 10: Pack installation tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("Marketing Capture pack installation tracking", () => {
  it("records marketing capture pack installation with terminology overlay", async () => {
    await installPack(workspaceId, "marketing-capture-pack");

    const packInstalls = await queryAll<{ pack_id: string; terminology_json: string | null }>(
      `SELECT pack_id, terminology_json FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "marketing-capture-pack"]
    );

    expect(packInstalls).toHaveLength(1);
    expect(packInstalls[0].terminology_json).not.toBeNull();

    const terminology = JSON.parse(packInstalls[0].terminology_json!);
    expect(terminology).toHaveLength(2);
    expect(terminology[0].object).toBe("company");
    expect(terminology[0].navigationLabel).toBe("Customer");
    expect(terminology[1].object).toBe("deal");
    expect(terminology[1].navigationLabel).toBe("Opportunity");
  });

  it("updates marketing capture pack installation on re-install (idempotent)", async () => {
    await installPack(workspaceId, "marketing-capture-pack");
    await installPack(workspaceId, "marketing-capture-pack");

    const packInstalls = await queryAll<{ pack_id: string }>(
      `SELECT pack_id FROM ${TABLES.packInstallations}
       WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "marketing-capture-pack"]
    );

    expect(packInstalls).toHaveLength(1);
  });
});
