"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2,
  FileText, Play, Search, XCircle,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch, apiPost } from "@/lib/api-fetch";

interface Toast { type: "success" | "error"; message: string }

interface InventoryItem {
  module: string;
  count: number;
  needsMigration: boolean;
}

interface MigrationConflict {
  type: string;
  description: string;
  recordId?: string;
}

interface MigrationResult {
  inventory?: InventoryItem[];
  migrated?: number;
  enabled?: number;
  verified?: boolean;
  conflicts?: MigrationConflict[];
  status?: string;
}

export default function MigrationPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();

  const [result, setResult] = useState<MigrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "inventory" | "migrated" | "verified">("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirming, setConfirming] = useState(false);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const runInventory = async () => {
    try {
      setLoading(true);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data: MigrationResult;
      }>(`/api/workspaces/${workspaceId}/migration/v04-v05`, { cache: "no-store" });
      if (!json.success) throw new Error(json.error?.message ?? "Inventory failed");
      setResult(json.data);
      setStep("inventory");
      showToast("success", "Inventory completed");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Inventory failed");
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    try {
      setLoading(true);
      setConfirming(false);
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: MigrationResult }>(
        `/api/workspaces/${workspaceId}/migration/v04-v05`,
        { action: "migrate" }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Migration failed");
      setResult(json.data);
      setStep("migrated");
      showToast("success", `Migration completed: ${json.data?.migrated ?? 0} records migrated`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Migration failed");
    } finally {
      setLoading(false);
    }
  };

  const runVerify = async () => {
    try {
      setLoading(true);
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: MigrationResult }>(
        `/api/workspaces/${workspaceId}/migration/v04-v05`,
        { action: "verify" }
      );
      if (!json.success) throw new Error(json.error?.message ?? "Verify failed");
      setResult(json.data);
      setStep("verified");
      showToast("success", "Verification completed");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Verify failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("migration.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("migration.description")}</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`flex items-center gap-2 ${step === "idle" ? "font-semibold text-slate-900" : "text-slate-500"}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === "idle" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>1</span>
          {t("migration.inventory")}
        </div>
        <ArrowLeft size={14} className="text-slate-400" />
        <div className={`flex items-center gap-2 ${step === "inventory" ? "font-semibold text-slate-900" : "text-slate-500"}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === "inventory" || step === "migrated" || step === "verified" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>2</span>
          {t("migration.runMigration")}
        </div>
        <ArrowLeft size={14} className="text-slate-400" />
        <div className={`flex items-center gap-2 ${step === "migrated" || step === "verified" ? "font-semibold text-slate-900" : "text-slate-500"}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === "verified" ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"}`}>3</span>
          {t("migration.verify")}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {step === "idle" && (
          <button onClick={() => void runInventory()} disabled={loading} className="app-button-primary">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {t("migration.inventory")}
          </button>
        )}
        {step === "inventory" && (
          <button onClick={() => setConfirming(true)} disabled={loading} className="app-button-primary">
            <Play size={16} />
            {t("migration.runMigration")}
          </button>
        )}
        {step === "migrated" && (
          <button onClick={() => void runVerify()} disabled={loading} className="app-button-primary">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {t("migration.verify")}
          </button>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t("migration.runMigration")}</h3>
                <p className="mt-1 text-sm text-slate-500">{t("migration.confirm")}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="app-button-ghost">{t("workspace.cancel")}</button>
              <button onClick={() => void runMigration()} disabled={loading} className="app-button-primary">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {t("migration.runMigration")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Inventory */}
          {result.inventory && result.inventory.length > 0 && (
            <div className="app-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText size={16} />
                {t("migration.inventory")}
              </h3>
              <div className="mt-3 space-y-2">
                {result.inventory.map((item, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-sm font-medium text-slate-700">{item.module}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">{item.count} records</span>
                      {item.needsMigration ? (
                        <span className="app-badge bg-amber-50 text-amber-700">Needs migration</span>
                      ) : (
                        <span className="app-badge bg-green-50 text-green-700">OK</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {result.conflicts && result.conflicts.length > 0 && (
            <div className="app-card border-amber-200 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-amber-700">
                <AlertTriangle size={16} />
                {t("migration.conflicts")}
              </h3>
              <div className="mt-3 space-y-2">
                {result.conflicts.map((conflict, i) => (
                  <div key={i} className="rounded-lg bg-amber-50 p-3 text-sm">
                    <span className="font-semibold text-amber-800">{conflict.type}</span>
                    <p className="mt-1 text-amber-700">{conflict.description}</p>
                    {conflict.recordId && (
                      <p className="mt-1 font-mono text-xs text-amber-600">Record: {conflict.recordId}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Migration result */}
          {result.migrated !== undefined && (
            <div className="app-card p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Migration completed</p>
                  <p className="text-sm text-slate-500">
                    {result.migrated} records migrated, {result.enabled ?? 0} modules enabled
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Verification result */}
          {result.verified !== undefined && (
            <div className="app-card p-5">
              <div className="flex items-center gap-3">
                {result.verified ? (
                  <CheckCircle2 size={20} className="text-green-600" />
                ) : (
                  <XCircle size={20} className="text-red-600" />
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {result.verified ? "Verification passed" : "Verification failed"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {result.status ?? (result.verified ? t("migration.statusVerified") : t("migration.statusConflict"))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
