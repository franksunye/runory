"use client";

// ── Mobile Visit Detail Page (v0.5.1) ──
//
// Per v0.5.1 Mobile Field-Work Spec §4.2:
// "Technician opens the Visit and sees customer/site contact context, asset,
//  instructions, and service history allowed by permission."
//
// Fetches:
//   - Visit record:  /api/workspaces/{workspaceId}/objects/service_visit/records/{visitId}
//   - Timeline:      /api/workspaces/{workspaceId}/timeline?subjectType=service_visit&subjectId={visitId}
//   - My Work items:  /api/workspaces/{workspaceId}/my-work  (to find a linked work item)

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, AlertCircle, RefreshCw,
  Clock, MapPin, User, Wrench, FileText, ClipboardList,
  ChevronRight, Calendar, Phone, Mail, Building2, History, PlayCircle,
  CheckCircle2, Navigation, MapPin as MapPinArrive, Truck,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import type { MyWorkItem } from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

export const dynamic = "force-dynamic";

// ── Types ──

type VisitRecord = Record<string, string | number | boolean | null>;

interface TimelineEntry {
  id: string;
  event_type: string;
  occurred_at: string;
  subject_type: string;
  subject_id: string;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

interface TimelineResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
}

// ── Status styling ──

type VisitStatus =
  | "unplanned"
  | "scheduled"
  | "en_route"
  | "on_site"
  | "completed"
  | "cancelled";

interface StatusStyle {
  badge: string;
  dot: string;
  labelKey: MessageKey;
}

const STATUS_STYLE: Record<VisitStatus, StatusStyle> = {
  unplanned: {
    badge: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    labelKey: "mobile.visitStatusUnplanned",
  },
  scheduled: {
    badge: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    labelKey: "mobile.visitStatusScheduled",
  },
  en_route: {
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    labelKey: "mobile.visitStatusEnRoute",
  },
  on_site: {
    badge: "bg-green-50 text-green-700",
    dot: "bg-green-500",
    labelKey: "mobile.visitStatusOnSite",
  },
  completed: {
    badge: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
    labelKey: "mobile.visitStatusCompleted",
  },
  cancelled: {
    badge: "bg-red-50 text-red-600",
    dot: "bg-red-500",
    labelKey: "mobile.visitStatusCancelled",
  },
};

function getStatusStyle(status: string): StatusStyle {
  return (
    STATUS_STYLE[status as VisitStatus] ?? {
      badge: "bg-slate-100 text-slate-600",
      dot: "bg-slate-400",
      labelKey: "mobile.visitStatusUnplanned",
    }
  );
}

// ── Helpers ──

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function str(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

function toTimelineSummary(entry: TimelineEntry): string {
  // Try to produce a readable summary from the event_type and metadata.
  const parts = entry.event_type.split(".");
  if (entry.summary && entry.summary !== parts[parts.length - 1]) {
    return entry.summary;
  }
  const action = parts[parts.length - 1] ?? entry.event_type;
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toTimelineSourceLabel(entry: TimelineEntry): string {
  const source = String(entry.metadata?.source ?? entry.event_type.split(".")[0] ?? "");
  switch (source) {
    case "workflow":
      return "Workflow";
    case "audit":
      return "Audit";
    case "form":
      return "Form";
    case "schedule":
      return "Schedule";
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

// ── Page (Suspense wrapper) ──

export default function MobileVisitDetailPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileVisitDetailPage />
    </Suspense>
  );
}

function MobileVisitDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const visitId = params.visitId as string;
  const router = useRouter();
  const { t } = useI18n();

  const [visit, setVisit] = useState<VisitRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [workItem, setWorkItem] = useState<MyWorkItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        // Fetch visit record + timeline in parallel.
        const [visitRes, timelineRes] = await Promise.all([
          fetch(
            `/api/workspaces/${workspaceId}/objects/service_visit/records/${visitId}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/workspaces/${workspaceId}/timeline?subjectType=service_visit&subjectId=${encodeURIComponent(visitId)}`,
            { cache: "no-store" }
          ),
        ]);

        const visitJson = await visitRes.json();
        if (!visitJson.success) {
          throw new Error(visitJson.error?.message ?? t("mobile.errorOccurred"));
        }
        setVisit(visitJson.data ?? null);

        // Timeline may fail independently without blocking the visit view.
        if (timelineRes.ok) {
          const timelineJson = await timelineRes.json();
          if (timelineJson.success) {
            const data = timelineJson.data as TimelineResponse;
            setTimeline(data?.entries ?? []);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("mobile.errorOccurred"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, visitId, t]
  );

  // Separate fetch for the linked work item — non-blocking.
  const loadWorkItem = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/my-work`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.success) return;
      const items: MyWorkItem[] = json.data?.items ?? [];
      // Find an active work item referencing this visit as its subject.
      const linked = items.find(
        (i) =>
          i.subject_type === "service_visit" &&
          i.subject_id === visitId &&
          i.status !== "completed" &&
          i.status !== "cancelled"
      );
      setWorkItem(linked ?? null);
    } catch {
      // Non-critical — the work-item link is optional.
    }
  }, [workspaceId, visitId]);

  useEffect(() => {
    void load();
    void loadWorkItem();
  }, [load, loadWorkItem]);

  // ── Visit lifecycle commands (v0.5.1 Spec §4.2) ──
  //
  // The visit status field is governed by named commands:
  //   scheduled → start_travel → en_route → arrive → on_site → complete → completed
  //   (any state) → cancel → cancelled
  //
  // The mobile UI exposes these as contextual action buttons that call the
  // unified command API at /api/workspaces/{id}/commands/{commandType}.

  const [lifecycleExecuting, setLifecycleExecuting] = useState<string | null>(null);
  const [lifecycleToast, setLifecycleToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const executeVisitCommand = useCallback(
    async (commandType: string) => {
      if (!visit) return;
      setLifecycleExecuting(commandType);
      setLifecycleToast(null);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/commands/${commandType}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              recordId: visitId,
              expectedVersion: visit.version ?? 1,
            }),
          }
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? t("mobile.actionFailed"));
        }
        notifyWorkspaceDataChanged();
        setLifecycleToast({ type: "success", message: t("mobile.actionSuccess") });
        await load();
      } catch (e) {
        setLifecycleToast({
          type: "error",
          message: e instanceof Error ? e.message : t("mobile.actionFailed"),
        });
      } finally {
        setLifecycleExecuting(null);
      }
    },
    [visit, workspaceId, visitId, load, t]
  );

  // ── Derived display values ──

  const title = visit ? str(visit.title) || t("mobile.visitTitleDefault") : "";
  const status = visit ? str(visit.status) || "unplanned" : "unplanned";
  const statusStyle = getStatusStyle(status);

  const scheduledStart = visit ? str(visit.scheduled_start) : "";
  const scheduledEnd = visit ? str(visit.scheduled_end) : "";
  const actualStart = visit ? str(visit.actual_start) : "";

  // Determine which lifecycle buttons to show based on current status
  const lifecycleButtons: { command: string; labelKey: MessageKey; icon: typeof Truck; style: string }[] = [];
  if (visit) {
    if (status === "scheduled") {
      lifecycleButtons.push({
        command: "visit.start_travel",
        labelKey: "mobile.visitStartTravel",
        icon: Truck,
        style: "bg-amber-600 text-white active:bg-amber-700",
      });
    }
    if (status === "en_route") {
      lifecycleButtons.push({
        command: "visit.arrive",
        labelKey: "mobile.visitArrive",
        icon: Navigation,
        style: "bg-green-600 text-white active:bg-green-700",
      });
    }
    if (status === "on_site") {
      lifecycleButtons.push({
        command: "visit.complete",
        labelKey: "mobile.visitComplete",
        icon: CheckCircle2,
        style: "bg-indigo-600 text-white active:bg-indigo-700",
      });
    }
    if (status !== "completed" && status !== "cancelled") {
      lifecycleButtons.push({
        command: "visit.cancel",
        labelKey: "mobile.visitCancel",
        icon: AlertCircle,
        style: "border border-red-200 bg-white text-red-600 active:bg-red-50",
      });
    }
  }
  const actualEnd = visit ? str(visit.actual_end) : "";
  const notes = visit ? str(visit.notes) : "";
  const workOrderId = visit ? str(visit.work_order_id) : "";
  const technicianId = visit ? str(visit.technician_id) : "";
  const outcome = visit ? str(visit.outcome) : "";

  // Customer / site / asset context — these may be denormalized onto the visit
  // record or provided via extensions. We read defensively.
  const customerName = str(visit?.customer_name);
  const contactName = str(visit?.contact_name);
  const contactPhone = str(visit?.contact_phone);
  const contactEmail = str(visit?.contact_email);
  const siteName = str(visit?.site_name);
  const siteAddress = str(visit?.site_address);
  const assetName = str(visit?.asset_name);
  const instructions = str(visit?.instructions) || notes;

  const hasCustomerContext = Boolean(customerName || contactName || contactPhone || contactEmail);
  const hasSiteContext = Boolean(siteName || siteAddress);
  const hasAssetContext = Boolean(assetName);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
            aria-label={t("mobile.visitBack")}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t("mobile.visitEyebrow")}
            </p>
            <h1 className="mt-0.5 truncate text-base font-bold text-slate-900">
              {title}
            </h1>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label={t("workspace.refresh")}
          >
            {refreshing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">{t("mobile.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertTriangle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.retry")}
            </button>
          </div>
        ) : !visit ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle size={28} className="text-slate-400" />
            <p className="text-sm text-slate-500">{t("mobile.visitNotFound")}</p>
            <button
              onClick={() => router.push(`/m/w/${workspaceId}`)}
              className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              {t("mobile.tabToday")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status & appointment card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${statusStyle.dot}`} />
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyle.badge}`}
                >
                  {t(statusStyle.labelKey)}
                </span>
              </div>

              <dl className="mt-3 space-y-2.5">
                {/* Appointment time */}
                <div className="flex items-start gap-3">
                  <dt className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-slate-400">
                    <Calendar size={12} />
                    {t("mobile.visitAppointment")}
                  </dt>
                  <dd className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {scheduledStart ? (
                      <>
                        <span className="block">{formatDateLabel(scheduledStart)}</span>
                        <span className="text-slate-500">
                          {formatTime(scheduledStart)}
                          {scheduledEnd ? ` – ${formatTime(scheduledEnd)}` : ""}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>

                {/* Actual times */}
                {actualStart && (
                  <div className="flex items-start gap-3">
                    <dt className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-slate-400">
                      <Clock size={12} />
                      {t("mobile.visitActualTime")}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                      {formatTime(actualStart)}
                      {actualEnd ? ` – ${formatTime(actualEnd)}` : ""}
                    </dd>
                  </div>
                )}

                {/* Technician */}
                {technicianId && (
                  <div className="flex items-start gap-3">
                    <dt className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-slate-400">
                      <User size={12} />
                      {t("mobile.visitTechnician")}
                    </dt>
                    <dd className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {technicianId}
                    </dd>
                  </div>
                )}

                {/* Related work order */}
                {workOrderId && (
                  <div className="flex items-start gap-3">
                    <dt className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-slate-400">
                      <ClipboardList size={12} />
                      {t("mobile.visitWorkOrder")}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm font-mono text-slate-600">
                      {workOrderId}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Start work execution link */}
            {workItem && (
              <Link
                href={`/m/w/${workspaceId}/work/${workItem.id}`}
                className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-indigo-700"
              >
                <span className="flex items-center gap-2">
                  <PlayCircle size={18} />
                  {t("mobile.visitStartWork")}
                </span>
                <ChevronRight size={18} />
              </Link>
            )}

            {/* Visit lifecycle command buttons (v0.5.1 Spec §4.2) */}
            {lifecycleButtons.length > 0 && (
              <div className="space-y-2">
                {lifecycleButtons.map((btn) => {
                  const Icon = btn.icon;
                  const isExecuting = lifecycleExecuting === btn.command;
                  return (
                    <button
                      key={btn.command}
                      onClick={() => void executeVisitCommand(btn.command)}
                      disabled={!!lifecycleExecuting}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${btn.style}`}
                    >
                      {isExecuting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Icon size={18} />
                      )}
                      {t(btn.labelKey)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Lifecycle toast */}
            {lifecycleToast && (
              <div
                className={`fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
                  lifecycleToast.type === "success" ? "bg-green-600" : "bg-red-600"
                }`}
                style={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
              >
                {lifecycleToast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {lifecycleToast.message}
              </div>
            )}

            {/* Customer / contact context */}
            {hasCustomerContext && (
              <ContextCard
                icon={Building2}
                title={t("mobile.visitCustomerContext")}
              >
                {customerName && (
                  <ContextRow label={t("mobile.visitCustomer")}>
                    {customerName}
                  </ContextRow>
                )}
                {contactName && (
                  <ContextRow label={t("mobile.visitContact")}>
                    {contactName}
                  </ContextRow>
                )}
                {contactPhone && (
                  <a
                    href={`tel:${contactPhone}`}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 -mx-3 text-sm font-medium text-indigo-600 active:bg-indigo-50"
                  >
                    <Phone size={14} />
                    {contactPhone}
                  </a>
                )}
                {contactEmail && (
                  <a
                    href={`mailto:${contactEmail}`}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 -mx-3 text-sm font-medium text-indigo-600 active:bg-indigo-50"
                  >
                    <Mail size={14} />
                    {contactEmail}
                  </a>
                )}
              </ContextCard>
            )}

            {/* Site context */}
            {hasSiteContext && (
              <ContextCard
                icon={MapPin}
                title={t("mobile.visitSiteContext")}
              >
                {siteName && (
                  <ContextRow label={t("mobile.visitSiteName")}>
                    {siteName}
                  </ContextRow>
                )}
                {siteAddress && (
                  <ContextRow label={t("mobile.visitSiteAddress")}>
                    {siteAddress}
                  </ContextRow>
                )}
              </ContextCard>
            )}

            {/* Asset context */}
            {hasAssetContext && (
              <ContextCard
                icon={Wrench}
                title={t("mobile.visitAsset")}
              >
                <ContextRow label={t("mobile.visitAssetName")}>
                  {assetName}
                </ContextRow>
              </ContextCard>
            )}

            {/* Instructions */}
            {instructions && (
              <ContextCard
                icon={FileText}
                title={t("mobile.visitInstructions")}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {instructions}
                </p>
              </ContextCard>
            )}

            {/* Outcome */}
            {outcome && (
              <ContextCard
                icon={CheckCircle2}
                title={t("mobile.visitOutcome")}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {outcome}
                </p>
              </ContextCard>
            )}

            {/* Service history / timeline */}
            <div>
              <div className="mb-3 flex items-center gap-2 px-1">
                <History size={16} className="text-slate-400" />
                <h2 className="text-sm font-bold text-slate-700">
                  {t("mobile.visitServiceHistory")}
                </h2>
              </div>

              {timeline.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                  <p className="text-xs text-slate-400">
                    {t("mobile.visitNoHistory")}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute bottom-0 left-[7px] top-2 w-0.5 bg-slate-200" />
                  <ol className="space-y-3">
                    {timeline.map((entry) => (
                      <li key={entry.id} className="relative pl-8">
                        <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-white bg-slate-300" />
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 text-xs font-semibold text-slate-700">
                              {toTimelineSummary(entry)}
                            </p>
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400">
                              {toTimelineSourceLabel(entry)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {formatDateTime(entry.occurred_at)}
                            {entry.actor_id ? ` · ${entry.actor_id}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable context card ──

interface ContextCardProps {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}

function ContextCard({ icon: Icon, title, children }: ContextCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-slate-400" />
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-20 shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium text-slate-700">
        {children}
      </dd>
    </div>
  );
}
