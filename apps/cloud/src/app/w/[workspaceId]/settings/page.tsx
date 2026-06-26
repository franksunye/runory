"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

type OrgRole = "owner" | "admin" | "member";

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  organizationId?: string;
  organizationRole?: OrgRole;
}

function formatDate(iso: string, locale?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale ?? undefined);
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { t, locale, setLocale } = useI18n();

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Danger zone state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canManage = workspace?.organizationRole === "owner" || workspace?.organizationRole === "admin";

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`);
      const json = await res.json();
      if (json.success) {
        setWorkspace(json.data);
        setNameValue(json.data.name);
      } else {
        setError(json.error?.message ?? t("workspace.loadFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setSavingName(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setWorkspace(json.data);
        setEditingName(false);
        setMessage(t("settings.nameUpdated"));
      } else {
        setError(json.error?.message ?? t("workspace.updateFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameValue(workspace?.name ?? "");
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== workspace?.name) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action: "delete" }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(t("settings.scheduledDelete"));
        setConfirmDelete(false);
        await loadData();
      } else {
        setError(json.error?.message ?? t("workspace.deleteFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Settings</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("settings.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Customize hint */}
      <div className="app-card flex items-center gap-3 border-indigo-100 bg-indigo-50/40 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
          <SlidersHorizontal size={18} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{t("settings.customizeHintTitle")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("settings.customizeHintBody")}</p>
        </div>
        <Link
          href={`/w/${workspaceId}/customize`}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          {t("settings.goCustomize")}
        </Link>
      </div>

      {/* Workspace metadata */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">{t("settings.infoTitle")}</h2>
        </div>
        <dl className="divide-y divide-slate-100">
          {/* Name (editable) */}
          <div className="py-3.5">
            <dt className="text-xs font-semibold text-slate-500">{t("settings.nameLabel")}</dt>
            <dd className="mt-1.5">
              {canManage && editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    maxLength={100}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={savingName || !nameValue.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {savingName ? t("workspace.saving") : t("workspace.save")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditName}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {t("workspace.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{workspace?.name}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => { setEditingName(true); setNameValue(workspace?.name ?? ""); }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil size={13} />{t("workspace.edit")}
                    </button>
                  )}
                </div>
              )}
            </dd>
          </div>

          {/* Slug (read-only) */}
          <div className="py-3.5">
            <dt className="text-xs font-semibold text-slate-500">{t("settings.slugLabel")}</dt>
            <dd className="mt-1.5">
              <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-700">{workspace?.slug}</code>
              <span className="ml-2 text-xs text-slate-400">{t("settings.readonly")}</span>
            </dd>
          </div>

          {/* Template (read-only) */}
          <div className="py-3.5">
            <dt className="text-xs font-semibold text-slate-500">{t("settings.templateLabel")}</dt>
            <dd className="mt-1.5">
              <span className="text-sm text-slate-700">
                {workspace?.template_id ? (
                  <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{workspace.template_id}</code>
                ) : (
                  t("settings.defaultTemplate")
                )}
              </span>
              <span className="ml-2 text-xs text-slate-400">{t("settings.readonly")}</span>
            </dd>
          </div>

          {/* Created date */}
          <div className="py-3.5">
            <dt className="text-xs font-semibold text-slate-500">{t("settings.createdAtLabel")}</dt>
            <dd className="mt-1.5 text-sm text-slate-700">{formatDate(workspace?.created_at ?? "", locale)}</dd>
          </div>

          {/* Updated date */}
          <div className="py-3.5">
            <dt className="text-xs font-semibold text-slate-500">{t("settings.updatedAtLabel")}</dt>
            <dd className="mt-1.5 text-sm text-slate-700">{formatDate(workspace?.updated_at ?? "", locale)}</dd>
          </div>
        </dl>
      </section>

      {/* Language */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">{t("settings.languageTitle")}</h2>
        </div>
        <p className="mb-3 text-xs text-slate-500">{t("settings.languageHint")}</p>
        <div className="flex items-center gap-2">
          {(["en", "zh"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLocale(item)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                locale === item
                  ? "bg-slate-950 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              aria-pressed={locale === item}
            >
              {item === "en" ? "English" : "中文"}
            </button>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      {canManage && (
        <section className="app-card border-red-200 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600" />
            <h2 className="text-sm font-bold text-red-700">{t("settings.dangerZone")}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{t("settings.deleteWorkspace")}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("settings.deleteWorkspaceHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 size={16} />{t("settings.deleteWorkspace")}
            </button>
          </div>
        </section>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle size={20} />
              </span>
              <h3 className="text-base font-bold text-slate-900">{t("settings.confirmDeleteTitle")}</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {t("settings.confirmDeleteBodyPrefix")}
              <span className="mx-1 font-mono font-semibold text-slate-800">{workspace?.name}</span>
              {t("settings.confirmDeleteBodySuffix")}
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={workspace?.name}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); setDeleteConfirmText(""); }}
                className="app-button-secondary"
              >
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirmText !== workspace?.name}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <Check size={16} />
                {deleting ? t("workspace.deleting") : t("settings.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
