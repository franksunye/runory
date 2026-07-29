"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Smartphone,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Monitor,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost, apiPatch } from "@/lib/api-fetch";

// ── Types ──

interface PushConfig {
  vapidConfigured: boolean;
  publicKey?: string;
}

interface PushSubscriptionInfo {
  id: string;
  endpoint: string;
  userAgent?: string;
  createdAt?: string;
  lastUsedAt?: string;
}

type Preferences = Record<string, boolean>;

// ── Constants ──

const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  key: string;
  labelKey: MessageKey;
}> = [
  { key: "visits", labelKey: "mobile.notificationsCategoryVisits" },
  { key: "workItems", labelKey: "mobile.notificationsCategoryWorkItems" },
  { key: "messages", labelKey: "mobile.notificationsCategoryMessages" },
  { key: "mentions", labelKey: "mobile.notificationsCategoryMentions" },
  { key: "reminders", labelKey: "mobile.notificationsCategoryReminders" },
  { key: "announcements", labelKey: "mobile.notificationsCategoryAnnouncements" },
  { key: "reports", labelKey: "mobile.notificationsCategoryReports" },
];

// ── Helpers ──

/**
 * Convert a base64url-encoded VAPID public key to an ArrayBuffer,
 * suitable for `pushManager.subscribe({ applicationServerKey })`.
 *
 * Returns ArrayBuffer (not Uint8Array) to satisfy the BufferSource type
 * in TypeScript 5.7+ where Uint8Array is generic over ArrayBufferLike.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

/**
 * Returns true if the page is running in standalone (PWA) mode.
 */
function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari uses navigator.standalone
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * Extract a short, human-readable label from a push endpoint URL.
 * e.g. "https://fcm.googleapis.com/fcm/send/abc123def456..." → "abc123de…ef456"
 */
function endpointToLabel(endpoint: string): string {
  const parts = endpoint.split("/");
  const last = parts[parts.length - 1] ?? endpoint;
  if (last.length <= 16) return last;
  return `${last.slice(0, 8)}…${last.slice(-6)}`;
}

// ── Toggle sub-component ──

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-200"
      } ${disabled ? "opacity-50" : "active:scale-95"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Main component ──

export function NotificationsSettings() {
  const { t } = useI18n();

  // Browser capability state
  const [pushSupported, setPushSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [standalone, setStandalone] = useState(false);

  // API state
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({});
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionInfo[]>(
    []
  );
  const [localSubscriptionActive, setLocalSubscriptionActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── Load config, preferences, and subscriptions on mount ──
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, prefsRes, subsRes] = await Promise.all([
        apiFetch<{ success: boolean; data?: PushConfig }>(
          "/api/push/config",
          { cache: "no-store" }
        ).catch(() => null),
        apiFetch<{ success: boolean; data?: Preferences }>(
          "/api/push/preferences",
          { cache: "no-store" }
        ).catch(() => null),
        apiFetch<{ success: boolean; data?: PushSubscriptionInfo[] }>(
          "/api/push/subscriptions",
          { cache: "no-store" }
        ).catch(() => null),
      ]);
      if (configRes?.data) setConfig(configRes.data);
      if (prefsRes?.data) setPreferences(prefsRes.data);
      if (subsRes?.data) setSubscriptions(subsRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Check local push subscription status ──
  const checkLocalSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setLocalSubscriptionActive(!!sub);
    } catch {
      // ignore — service worker may not be ready yet
    }
  }, []);

  useEffect(() => {
    // Browser capability checks (client-side only)
    setPushSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    setStandalone(isStandalonePWA());

    void loadAll();
    void checkLocalSubscription();
  }, [loadAll, checkLocalSubscription]);

  // ── Enable push: request permission → get VAPID key → subscribe → send to server ──
  const handleEnablePush = useCallback(async () => {
    if (!pushSupported) return;
    setStatusMessage(null);
    setActionLoading(true);
    try {
      // Step 1: Request notification permission (only on user gesture)
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setStatusMessage({
          type: "error",
          text: t("mobile.notificationsPermissionRequired"),
        });
        return;
      }

      // Step 2: Fetch VAPID public key from server
      const configRes = await apiFetch<{
        success: boolean;
        data?: PushConfig;
      }>("/api/push/config", { cache: "no-store" });
      const publicKey = configRes.data?.publicKey;
      if (!publicKey) {
        setStatusMessage({
          type: "error",
          text: t("mobile.notificationsVapidNotConfigured"),
        });
        return;
      }

      // Step 3: Subscribe via pushManager
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Step 4: Send subscription to server
      await apiPost("/api/push/subscribe", sub.toJSON());

      setLocalSubscriptionActive(true);
      setStatusMessage({
        type: "success",
        text: t("mobile.notificationsEnabled"),
      });
      void loadAll();
    } catch (e) {
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("mobile.errorOccurred"),
      });
    } finally {
      setActionLoading(false);
    }
  }, [pushSupported, t, loadAll]);

  // ── Disable push: unsubscribe locally + call server DELETE ──
  const handleDisablePush = useCallback(async () => {
    setStatusMessage(null);
    setActionLoading(true);
    try {
      // Unsubscribe locally first
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch {
          // ignore local unsubscribe errors
        }
      }

      // Notify server to remove the subscription
      await apiFetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      setLocalSubscriptionActive(false);
      setStatusMessage({
        type: "success",
        text: t("mobile.notificationsDisabled"),
      });
      void loadAll();
    } catch (e) {
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("mobile.errorOccurred"),
      });
    } finally {
      setActionLoading(false);
    }
  }, [t, loadAll]);

  // ── Toggle a preference category (optimistic update) ──
  const handleTogglePreference = useCallback(
    async (category: string, enabled: boolean) => {
      // Optimistic update
      setPreferences((prev) => ({ ...prev, [category]: enabled }));
      try {
        const res = await apiPatch<{ success: boolean; data?: Preferences }>(
          "/api/push/preferences",
          { category, enabled }
        );
        if (res.data) setPreferences(res.data);
      } catch (e) {
        // Revert on error
        setPreferences((prev) => ({ ...prev, [category]: !enabled }));
        setStatusMessage({
          type: "error",
          text: e instanceof Error ? e.message : t("mobile.errorOccurred"),
        });
      }
    },
    [t]
  );

  // ── Send a test push notification ──
  const handleSendTest = useCallback(async () => {
    setStatusMessage(null);
    setActionLoading(true);
    try {
      await apiPost("/api/push/test-remote");
      setStatusMessage({
        type: "success",
        text: t("mobile.notificationsTestSent"),
      });
    } catch (e) {
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : t("mobile.errorOccurred"),
      });
    } finally {
      setActionLoading(false);
    }
  }, [t]);

  const pushEnabled =
    localSubscriptionActive && notificationPermission === "granted";
  const vapidConfigured = config?.vapidConfigured ?? false;

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
        {t("mobile.notificationsTitle")}
      </h2>

      <div className="space-y-3">
        {/* ── Push status card ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                pushEnabled ? "bg-green-50" : "bg-slate-100"
              }`}
            >
              {pushEnabled ? (
                <BellRing size={20} className="text-green-600" />
              ) : (
                <BellOff size={20} className="text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">
                {t("mobile.notificationsPushStatus")}
              </p>
              <p className="text-xs text-slate-500">
                {loading
                  ? t("mobile.loading")
                  : pushEnabled
                    ? t("mobile.notificationsPushEnabled")
                    : t("mobile.notificationsPushDisabled")}
              </p>
            </div>
          </div>

          {/* VAPID configuration indicator */}
          {!loading && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              {vapidConfigured ? (
                <ShieldCheck size={14} className="text-green-500" />
              ) : (
                <ShieldAlert size={14} className="text-amber-500" />
              )}
              <span className="text-xs text-slate-500">
                {vapidConfigured
                  ? t("mobile.notificationsVapidConfigured")
                  : t("mobile.notificationsVapidNotConfigured")}
              </span>
            </div>
          )}

          {/* Warning: browser does not support Push API */}
          {!loading && !pushSupported && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-500"
              />
              <p className="text-xs leading-relaxed text-amber-700">
                {t("mobile.notificationsBrowserNotSupported")}
              </p>
            </div>
          )}

          {/* Warning: permission denied — guide user to browser settings */}
          {!loading &&
            pushSupported &&
            notificationPermission === "denied" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-red-500"
                />
                <p className="text-xs leading-relaxed text-red-700">
                  {t("mobile.notificationsPermissionDenied")}
                </p>
              </div>
            )}

          {/* Hint: install as PWA for best push support */}
          {!loading &&
            pushSupported &&
            notificationPermission !== "denied" &&
            !standalone && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                <Smartphone
                  size={16}
                  className="mt-0.5 shrink-0 text-blue-500"
                />
                <p className="text-xs leading-relaxed text-blue-700">
                  {t("mobile.notificationsInstallPWA")}
                </p>
              </div>
            )}

          {/* Inline status message (success / error) */}
          {statusMessage && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg p-3 ${
                statusMessage.type === "success"
                  ? "bg-green-50"
                  : "bg-red-50"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0 text-green-500"
                />
              ) : (
                <XCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-red-500"
                />
              )}
              <p
                className={`text-xs leading-relaxed ${
                  statusMessage.type === "success"
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                {statusMessage.text}
              </p>
            </div>
          )}

          {/* Action buttons */}
          {!loading && pushSupported && (
            <div className="mt-4 space-y-2">
              {!pushEnabled ? (
                <button
                  onClick={() => void handleEnablePush()}
                  disabled={actionLoading || !vapidConfigured}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition active:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Bell size={16} />
                  )}
                  {actionLoading
                    ? t("mobile.notificationsSubscribing")
                    : t("mobile.notificationsEnable")}
                </button>
              ) : (
                <button
                  onClick={() => void handleDisablePush()}
                  disabled={actionLoading}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition active:bg-red-50 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <BellOff size={16} />
                  )}
                  {t("mobile.notificationsDisable")}
                </button>
              )}

              {pushEnabled && (
                <button
                  onClick={() => void handleSendTest()}
                  disabled={actionLoading}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition active:bg-slate-50 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {t("mobile.notificationsSendTest")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Notification preferences card ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">
              {t("mobile.notificationsPreferences")}
            </p>
          </div>
          <div>
            {NOTIFICATION_CATEGORIES.map((cat, idx) => (
              <div
                key={cat.key}
                className={`flex min-h-[48px] items-center gap-3 px-4 ${
                  idx > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {t(cat.labelKey)}
                </span>
                <Toggle
                  checked={preferences[cat.key] ?? true}
                  onChange={() =>
                    void handleTogglePreference(
                      cat.key,
                      !(preferences[cat.key] ?? true)
                    )
                  }
                  disabled={!pushEnabled}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Active devices (subscription list) card ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">
              {t("mobile.notificationsSubscriptions")}
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Monitor size={20} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs text-slate-400">
                {t("mobile.notificationsNoSubscriptions")}
              </p>
            </div>
          ) : (
            <div>
              {subscriptions.map((sub, idx) => (
                <div
                  key={sub.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Monitor size={14} className="text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold text-slate-700">
                      {endpointToLabel(sub.endpoint)}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {sub.userAgent || "—"}
                    </p>
                  </div>
                  {sub.lastUsedAt && (
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {new Date(sub.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
