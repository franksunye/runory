import { notFound } from "next/navigation";
import {
  queryAll,
  businessTable,
  TABLES,
  getFormDefinition,
} from "@runory/platform-core";
import type { FormBlock } from "@runory/contracts";
import { en } from "@/i18n/messages";
import { FormBlockRenderer } from "./FormBlockRenderer";

export const dynamic = "force-dynamic";

const HONEYPOT_FIELD = "_company_website";

interface LandingPageRecord {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  status: string;
  headline: string | null;
  subheadline: string | null;
  body_html: string | null;
  cta_text: string | null;
  form_id: string | null;
  campaign_id: string | null;
  meta_description: string | null;
  published_at: string | null;
}

interface FormRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  fields_json: string | null;
  submit_button_label: string | null;
  success_message: string | null;
}

async function getPublishedLandingPage(slug: string): Promise<LandingPageRecord | null> {
  const tableName = businessTable("landing_page");
  const rows = await queryAll<LandingPageRecord>(
    `SELECT * FROM ${tableName} WHERE slug = ? AND status = 'published'`,
    [slug]
  );
  return rows[0] ?? null;
}

async function getForm(formId: string): Promise<FormRecord | null> {
  const tableName = businessTable("form");
  const rows = await queryAll<FormRecord>(
    `SELECT id, name, slug, status, fields_json, submit_button_label, success_message FROM ${tableName} WHERE id = ? AND status = 'published'`,
    [formId]
  );
  return rows[0] ?? null;
}

// ── Forms 2.0 (V2) lookup ──
//
// A landing page's form_id may reference either a legacy V1 form record
// (businessTable("form")) or a Forms 2.0 form definition
// (TABLES.formDefinitions). Definition IDs are globally unique, so we resolve
// without a workspace filter, then load the active published version's schema
// via the official getFormDefinition API.
interface V2FormDefinition {
  definitionId: string;
  name: string;
  blocks: FormBlock[];
}

async function getV2FormDefinition(
  formId: string
): Promise<V2FormDefinition | null> {
  const rows = await queryAll<{
    id: string;
    workspace_id: string;
    form_key: string;
    name: string;
    status: string;
    active_version_id: string | null;
  }>(
    `SELECT id, workspace_id, form_key, name, status, active_version_id
     FROM ${TABLES.formDefinitions}
     WHERE id = ? AND status = 'active'`,
    [formId]
  );
  if (rows.length === 0) return null;
  const def = rows[0];
  if (!def.active_version_id) return null;

  const active = await getFormDefinition(def.workspace_id, def.form_key);
  if (!active) return null;

  return {
    definitionId: def.id,
    name: def.name,
    blocks: active.schema.blocks as FormBlock[],
  };
}

interface FormField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landingPage = await getPublishedLandingPage(slug);

  if (!landingPage) {
    notFound();
  }

  // Resolve the form attached to this landing page. Try Forms 2.0 first
  // (definition-based blocks); fall back to the legacy V1 form table.
  let v2Form: V2FormDefinition | null = null;
  let form: FormRecord | null = null;
  let formFields: FormField[] = [];

  if (landingPage.form_id) {
    v2Form = await getV2FormDefinition(landingPage.form_id);
    if (!v2Form) {
      form = await getForm(landingPage.form_id);
      if (form?.fields_json) {
        try {
          formFields = JSON.parse(form.fields_json);
        } catch {
          formFields = [];
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* SEO meta */}
      {landingPage.meta_description && (
        <meta name="description" content={landingPage.meta_description} />
      )}

      {/* Hero section */}
      <header className="mx-auto max-w-4xl px-6 py-16 text-center">
        {landingPage.headline && (
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {landingPage.headline}
          </h1>
        )}
        {landingPage.subheadline && (
          <p className="mt-4 text-lg text-slate-600">
            {landingPage.subheadline}
          </p>
        )}
      </header>

      {/* Body content */}
      {landingPage.body_html && (
        <main
          className="prose prose-slate mx-auto max-w-3xl px-6 py-8"
          dangerouslySetInnerHTML={{ __html: landingPage.body_html }}
        />
      )}

      {/* V2 Form section (Forms 2.0 block-based forms) */}
      {v2Form && v2Form.blocks.length > 0 && (
        <section className="mx-auto max-w-2xl px-6 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
            <h2 className="mb-6 text-2xl font-bold text-slate-900">
              {landingPage.cta_text ?? en["publicForm.defaultCta"]}
            </h2>
            <FormBlockRenderer
              blocks={v2Form.blocks}
              formId={v2Form.definitionId}
              landingPageId={landingPage.id}
              submitButtonLabel={en["publicForm.defaultSubmit"]}
              successMessage={en["publicForm.defaultSuccess"]}
              consentLabel={en["publicForm.consentLabel"]}
              defaultError={en["publicForm.defaultError"]}
              networkError={en["publicForm.networkError"]}
              honeypotField={HONEYPOT_FIELD}
            />
          </div>
        </section>
      )}

      {/* V1 Form section (legacy field-based forms) */}
      {form && formFields.length > 0 && (
        <section className="mx-auto max-w-2xl px-6 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
            <h2 className="mb-6 text-2xl font-bold text-slate-900">
              {landingPage.cta_text ?? en["publicForm.defaultCta"]}
            </h2>
            <form
              id="public-form"
              className="space-y-4"
              data-form-id={form.id}
              data-landing-page-id={landingPage.id}
            >
              {formFields.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={field.key}
                    className="block text-sm font-medium text-slate-700"
                  >
                    {field.label}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  {field.type === "text" && (
                    <textarea
                      id={field.key}
                      name={field.key}
                      required={field.required}
                      rows={field.key === "message" || field.key === "issue_description" ? 4 : 1}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}

              {/* Honeypot field (hidden from humans) */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor={HONEYPOT_FIELD}>Website</label>
                <input
                  id={HONEYPOT_FIELD}
                  name={HONEYPOT_FIELD}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Consent checkbox */}
              <div className="flex items-start">
                <input
                  id="_consent"
                  name="_consent"
                  type="checkbox"
                  required
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="_consent" className="ml-2 text-sm text-slate-600">
                  {en["publicForm.consentLabel"]}
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {form.submit_button_label ?? en["publicForm.defaultSubmit"]}
              </button>

              <p
                id="form-success"
                className="hidden rounded-md bg-green-50 px-4 py-3 text-sm text-green-700"
              >
                {form.success_message ?? en["publicForm.defaultSuccess"]}
              </p>
              <p
                id="form-error"
                className="hidden rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {en["publicForm.defaultError"]}
              </p>
            </form>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <p className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Runory. All rights reserved.
        </p>
      </footer>

      {/* Client-side form handler */}
      {form && formFields.length > 0 && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var form = document.getElementById('public-form');
                if (!form) return;
                var formId = form.getAttribute('data-form-id');
                var landingPageId = form.getAttribute('data-landing-page-id');
                var successEl = document.getElementById('form-success');
                var errorEl = document.getElementById('form-error');

                form.addEventListener('submit', async function(e) {
                  e.preventDefault();
                  successEl.classList.add('hidden');
                  errorEl.classList.add('hidden');

                  var data = {};
                  var inputs = form.querySelectorAll('input, textarea, select');
                  inputs.forEach(function(input) {
                    if (input.name && !input.name.startsWith('_')) {
                      if (input.type === 'checkbox') {
                        data[input.name] = input.checked;
                      } else {
                        data[input.name] = input.value;
                      }
                    }
                  });
                  // Add metadata
                  data._consent = document.getElementById('_consent').checked;
                  data._consent_text = ${JSON.stringify(en["publicForm.consentLabel"])};
                  data._landing_page_id = landingPageId;
                  data._source_url = window.location.href;

                  try {
                    var res = await fetch('/api/public/forms/' + formId + '/submit', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data)
                    });
                    var json = await res.json();
                    if (json.success) {
                      form.reset();
                      successEl.classList.remove('hidden');
                      successEl.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      errorEl.textContent = json.error?.message || ${JSON.stringify(en["publicForm.defaultError"])};
                      errorEl.classList.remove('hidden');
                    }
                  } catch (err) {
                    errorEl.textContent = ${JSON.stringify(en["publicForm.networkError"])};
                    errorEl.classList.remove('hidden');
                  }
                });
              })();
            `,
          }}
        />
      )}
    </div>
  );
}

