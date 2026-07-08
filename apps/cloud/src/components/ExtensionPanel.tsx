"use client";

import { useState } from "react";
import Link from "next/link";
import DiffPreview from "./DiffPreview";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiPost } from "@/lib/api-fetch";

interface ExtensionPanelProps {
  workspaceId: string;
  extensions: any[];
  hasCrmPack: boolean;
  installingPack?: boolean;
  onInstallPack: () => void | Promise<void>;
  onRefresh: () => void;
}

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

function buildExamplePlan(t: TFunc) {
  return {
    name: t("extensionPanel.example.name"),
    description: t("extensionPanel.example.description"),
    targetModules: ["runory.customer"],
    riskLevel: "low",
    customFields: [
      {
        targetObject: "customer",
        fieldKey: "tier",
        label: t("extensionPanel.example.fieldLabel"),
        type: "select",
        ownership: "workspace_extension",
        required: false,
        validation: { options: ["Bronze", "Silver", "Gold", "Platinum"] },
        ui: {
          listColumn: true,
          slot: "customer.form.basic_fields.after",
          order: 100,
        },
      },
    ],
  };
}

interface AppliedSummary {
  version: string;
  fields: Array<{ object: string; fieldKey: string; label: string }>;
  affectedViews: string[];
}

export default function ExtensionPanel({
  workspaceId,
  extensions,
  hasCrmPack,
  installingPack = false,
  onInstallPack,
  onRefresh,
}: ExtensionPanelProps) {
  const { t } = useI18n();
  const [planText, setPlanText] = useState(() => JSON.stringify(buildExamplePlan(t), null, 2));
  const [validation, setValidation] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<AppliedSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);

  const parsePlan = (): any | null => {
    try {
      return JSON.parse(planText);
    } catch (e) {
      setMessage({
        type: "error",
        text: t("extensionPanel.jsonParseFailed", { error: e instanceof Error ? e.message : t("extensionPanel.invalidJson") }),
      });
      return null;
    }
  };

  const handlePlan = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: t("extensionPanel.installCrmFirstPlan"),
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    setAppliedSummary(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: { valid: boolean; errors: string[] } }>(
        `/api/workspaces/${workspaceId}/agent/plan`,
        plan
      );
      if (json.success) {
        setValidation(json.data);
        setMessage(
          json.data.valid
            ? { type: "success", text: t("extensionPanel.validationPassed") }
            : {
                type: "error",
                text: t("extensionPanel.validationFailed", { errors: json.data.errors.join("; ") }),
              }
        );
      } else {
        setMessage({ type: "error", text: json.error?.message ?? t("extensionPanel.validationFailedShort") });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("extension.requestFailed"),
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: t("extensionPanel.installCrmFirstPreview"),
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    setAppliedSummary(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: unknown }>(
        `/api/workspaces/${workspaceId}/agent/preview`,
        plan
      );
      if (json.success) {
        setDiff(json.data);
        setMessage({ type: "info", text: t("extensionPanel.previewGenerated") });
      } else {
        setMessage({ type: "error", text: json.error?.message ?? t("extensionPanel.previewFailed") });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("extension.requestFailed"),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!hasCrmPack) {
      setMessage({
        type: "info",
        text: t("extensionPanel.installCrmFirstApply"),
      });
      return;
    }
    const plan = parsePlan();
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: { version: string } }>(
        `/api/workspaces/${workspaceId}/agent/apply`,
        { plan, createdBy: "ui-user" }
      );
      if (json.success) {
        const addedFields = (plan.customFields ?? []).map((field: any) => ({
          object: field.targetObject,
          fieldKey: field.fieldKey,
          label: field.label,
        }));
        const affectedViews = addedFields.flatMap((field: { object: string }) => [
          `${field.object}_list`,
          `${field.object}_form`,
        ]);
        setMessage({
          type: "success",
          text: t("extensionPanel.appliedSuccess", { version: json.data.version }),
        });
        setAppliedSummary({
          version: json.data.version,
          fields: addedFields,
          affectedViews: Array.from(new Set(affectedViews)),
        });
        setDiff(null);
        setValidation(null);
        notifyWorkspaceDataChanged();
        onRefresh();
      } else {
        setMessage({ type: "error", text: json.error?.message ?? t("extensionPanel.applyFailed") });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("extension.requestFailed"),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (extensionId: string) => {
    if (!confirm(t("extensionPanel.confirmRollbackLatest"))) return;
    setBusy(true);
    setMessage(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: { version: string } }>(
        `/api/workspaces/${workspaceId}/agent/rollback`,
        { extensionId, rolledBy: "ui-user" }
      );
      if (json.success) {
        setMessage({
          type: "success",
          text: t("extensionPanel.rolledBack", { version: json.data.version }),
        });
        notifyWorkspaceDataChanged();
        onRefresh();
      } else {
        setMessage({ type: "error", text: json.error?.message ?? t("extension.rollbackFailed") });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("extension.requestFailed"),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-900">
              {t("extensionPanel.guidedTitle")}
            </p>
            <p className="mt-1 text-xs text-indigo-700">
              {t("extensionPanel.guidedBody")}
            </p>
          </div>
          <Link
            href={`/w/${workspaceId}/customize`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            {t("extensionPanel.goCustomize")}
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Safe customization approval
        </p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">
          {t("extensionPanel.experienceTitle")}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {t("extensionPanel.experienceBody")}
        </p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">1. Plan</span>
            <br />
            {t("extensionPanel.step1Body")}
          </li>
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">2. Preview</span>
            <br />
            {t("extensionPanel.step2Body")}
          </li>
          <li className="rounded-xl bg-white p-3 text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">3. Apply</span>
            <br />
            {t("extensionPanel.step3Body")}
          </li>
        </ol>
      </div>

      {!hasCrmPack && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{t("extensionPanel.needCrmTitle")}</p>
              <p className="mt-1 text-amber-800">
                {t("extensionPanel.needCrmBody")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onInstallPack()}
              disabled={installingPack || busy}
              className="min-w-fit rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {installingPack ? t("extensionPanel.installing") : t("extensionPanel.installCrm")}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              {t("extensionPanel.jsonEditorTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("extensionPanel.jsonEditorHint")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              low risk
            </span>
            <button
              type="button"
              onClick={() => setJsonEditorOpen(!jsonEditorOpen)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {jsonEditorOpen ? t("extensionPanel.collapse") : t("extensionPanel.expand")}
            </button>
          </div>
        </div>
        {jsonEditorOpen && (
          <>
        <textarea
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
          rows={18}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePlan}
            disabled={busy || !hasCrmPack}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={!hasCrmPack ? t("extensionPanel.installCrmFirst") : undefined}
          >
            1. Validate Plan
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy || !hasCrmPack}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={!hasCrmPack ? t("extensionPanel.installCrmFirst") : undefined}
          >
            2. Preview Diff
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !hasCrmPack || !diff}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            title={
              !hasCrmPack
                ? t("extensionPanel.installCrmFirst")
                : !diff
                  ? t("extensionPanel.generatePreviewFirst")
                  : undefined
            }
          >
            3. Approve & Apply
          </button>
        </div>

        {validation && (
          <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs">
            <p className="font-medium text-slate-700">
              {t("extensionPanel.validationResult", { result: validation.valid ? t("extensionPanel.passed") : t("extensionPanel.failed") })}
            </p>
            {validation.errors?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-red-600">
                {validation.errors.map((e: string, i: number) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {message && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : message.type === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {appliedSummary && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">
                  {t("extensionPanel.applyCompleteTitle")}
                </p>
                <p className="mt-1 text-emerald-800">
                  {t("extensionPanel.applyCompleteBody", { version: appliedSummary.version, fields: appliedSummary.fields.map((field) => field.label).join(", "), views: appliedSummary.affectedViews.join(", ") })}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  {t("extensionPanel.nextStepHint")}
                </p>
              </div>
              <div className="flex min-w-fit flex-wrap gap-2">
                <Link
                  href={`/w/${workspaceId}/customers`}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  {t("extensionPanel.viewCustomers")}
                </Link>
                <Link
                  href={`/w/${workspaceId}/audit`}
                  className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  {t("extensionPanel.viewAudit")}
                </Link>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {diff && (
        <div className="space-y-3">
          <DiffPreview diff={diff} />
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t("extensionPanel.approvalPointBefore")}<strong>Approve & Apply</strong>{t("extensionPanel.approvalPointAfter")}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          {t("extensionPanel.installedCount", { count: extensions.length })}
        </h3>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-500">{t("extensionPanel.noExtensions")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {extensions.map((ext) => (
              <li
                key={ext.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {ext.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("extensionPanel.extensionMeta", { version: ext.currentVersion, namespace: ext.namespace, status: ext.status })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRollback(ext.id)}
                  disabled={busy || ext.currentVersion === 0}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {t("extension.rollback")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
