"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Check, ChevronDown, ChevronRight, Loader2, LogIn } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import UserAvatar from "./UserAvatar";

interface Persona {
  id: string;
  label: string;
  externalId: string;
  color: string;
  avatarUrl: string | null;
}

interface PersonaApiResponse {
  personas: Persona[];
  current: string;
}

interface AccessSummary {
  recordScope: "all" | "assigned";
  permissionGroups: Array<{ label: string }>;
  resourceIds: string[];
}

const TEXT_COLOR_CLASSES: Record<string, string> = {
  slate: "text-slate-600",
  blue: "text-blue-600",
  indigo: "text-indigo-600",
  amber: "text-amber-600",
  emerald: "text-emerald-600",
  purple: "text-purple-600",
};

const PERSONA_DESCRIPTION_KEYS: Record<string, MessageKey> = {
  "dev-local-owner": "persona.desc.owner",
  "persona:sales-rep": "persona.desc.salesRep",
  "persona:sales-manager": "persona.desc.salesManager",
  "persona:dispatcher": "persona.desc.dispatcher",
  "persona:technician": "persona.desc.technician",
  "persona:technician-james": "persona.desc.technician",
  "persona:technician-maria": "persona.desc.technician",
  "persona:supervisor": "persona.desc.supervisor",
};

export default function PersonaSwitcher({ variant = "floating" }: { variant?: "floating" | "account" }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [current, setCurrent] = useState<string>("dev-local-owner");
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(null);
  const [mounted, setMounted] = useState(false);
  const [accountPanelPosition, setAccountPanelPosition] = useState<{ left: number; bottom: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountPanelRef = useRef<HTMLDivElement>(null);
  const workspaceId = pathname?.match(/^\/w\/([^/]+)/)?.[1] ?? null;

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/persona", { cache: "no-store" });
      if (!res.ok) return;
      const data: PersonaApiResponse = await res.json();
      setPersonas(data.personas);
      setCurrent(data.current);
      setLoaded(true);
    } catch {
      // Endpoint not available — silently hide the switcher
    }
  }, []);

  useEffect(() => {
    void fetchPersonas();
  }, [fetchPersonas]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceRole(null);
      setAccessSummary(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { success?: boolean; data?: { workspaceRole?: string; organizationRole?: string; accessSummary?: AccessSummary | null } } | null) => {
        if (!cancelled) {
          setWorkspaceRole(data?.success ? data.data?.workspaceRole ?? data.data?.organizationRole ?? null : null);
          setAccessSummary(data?.success ? data.data?.accessSummary ?? null : null);
        }
      })
      .catch(() => { if (!cancelled) { setWorkspaceRole(null); setAccessSummary(null); } });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!dropdownRef.current?.contains(target) && !accountPanelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (variant !== "account" || !open) return;
    const updatePosition = () => {
      const rect = accountTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAccountPanelPosition({
        left: Math.min(rect.right + 8, Math.max(8, window.innerWidth - 336)),
        bottom: Math.max(8, window.innerHeight - rect.bottom),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, variant]);

  const handleSelect = useCallback(
    async (personaId: string) => {
      if (personaId === current || switching) return;
      setSwitching(true);
      try {
        const res = await fetch("/api/dev/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId }),
        });
        if (res.ok) {
          // Reload the page so all data is re-fetched with the new identity
          window.location.reload();
        }
      } catch {
        setSwitching(false);
      }
    },
    [current, switching]
  );

  // Only render in dev mode — in production, users log in via OTP with their own email
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NEXT_PUBLIC_PLATFORM_DEV_BOOTSTRAP !== "true"
  ) {
    return null;
  }

  // Don't render until we've confirmed the endpoint is available
  if (!loaded) return null;

  // Workspace pages provide the switcher through the account menu. Keep the
  // global control available on non-workspace surfaces such as the workspace
  // dashboard, where that menu does not exist.
  if (variant === "floating" && pathname?.startsWith("/w/")) return null;

  const currentPersona = personas.find((p) => p.id === current) ?? personas[0];
  const roleLabelKey: Record<string, MessageKey> = {
    owner: "workspace.nav.roleOwner",
    admin: "workspace.nav.roleAdmin",
    member: "workspace.nav.roleMember",
    viewer: "workspace.nav.roleViewer",
  };
  const currentRoleLabel = workspaceRole && roleLabelKey[workspaceRole]
    ? t(roleLabelKey[workspaceRole])
    : null;
  const panel = (
    <>
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("persona.title")}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800">
          {t("persona.viewingAs", { name: currentPersona?.label ?? t("persona.trigger") })}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">{t("persona.hint")}</p>
        {currentRoleLabel && (
          <p className="mt-2 rounded-md bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700">
            {t("persona.workspaceAccess", { role: currentRoleLabel })}
          </p>
        )}
        {accessSummary && (
          <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
            <p className="font-semibold text-slate-700">
              {accessSummary.recordScope === "all" ? t("persona.dataScopeAll") : t("persona.dataScopeAssigned")}
            </p>
            {accessSummary.permissionGroups.length > 0 && (
              <p className="mt-0.5 truncate text-slate-500">
                {t("persona.permissionGroups", { groups: accessSummary.permissionGroups.map((group) => group.label).join(", ") })}
              </p>
            )}
          </div>
        )}
      </div>
      <ul className="max-h-80 overflow-y-auto py-1">
        {personas.map((persona) => {
          const isActive = persona.id === current;
          const descriptionKey = PERSONA_DESCRIPTION_KEYS[persona.id];
          return (
            <li key={persona.id}>
              <button
                type="button"
                disabled={switching}
                onClick={() => void handleSelect(persona.id)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? "bg-slate-50" : ""}`}
              >
                <UserAvatar name={persona.label} avatarUrl={persona.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-700">{persona.label}</span>
                  {descriptionKey && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{t(descriptionKey)}</span>}
                </span>
                {isActive && <Check size={16} className={`shrink-0 ${TEXT_COLOR_CLASSES[persona.color] ?? "text-slate-500"}`} />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700" onClick={() => setOpen(false)}>
          <LogIn size={13} />
          {t("persona.otpLogin")}
        </Link>
        <p className="mt-1 text-[11px] leading-4 text-slate-400">{t("persona.otpLoginHint")}</p>
      </div>
    </>
  );

  if (variant === "account") {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          ref={accountTriggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={switching}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {switching ? <Loader2 size={18} className="animate-spin text-slate-500" /> : <Users size={18} />}
          <span className="min-w-0 flex-1">
            <span className="block">{t("persona.title")}</span>
            <span className="block truncate text-[11px] font-normal text-slate-500">
              {currentPersona ? t("persona.viewingAs", { name: currentPersona.label }) : t("persona.trigger")}
            </span>
          </span>
          <ChevronRight size={17} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && mounted && accountPanelPosition && createPortal(
          <div
            ref={accountPanelRef}
            className="fixed z-[9999] max-h-[calc(100vh-16px)] w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,.18)]"
            style={accountPanelPosition}
          >
            {panel}
          </div>,
          document.body,
        )}
      </div>
    );
  }

  const isMobileWorkspace = pathname?.startsWith("/m/w/");
  return (
    <div ref={dropdownRef} className={`fixed right-4 z-[9999] ${isMobileWorkspace ? "bottom-20" : "bottom-4"}`}>
      {open && <div className="mb-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">{panel}</div>}
      <button type="button" onClick={() => setOpen((value) => !value)} disabled={switching} className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60" title={t("persona.title")}>
        {switching ? <Loader2 size={18} className="animate-spin text-slate-500" /> : <Users size={18} className="text-slate-600" />}
        <div className="flex items-center gap-2">
          {currentPersona && <UserAvatar name={currentPersona.label} avatarUrl={currentPersona.avatarUrl} size="sm" />}
          <span className="text-sm font-semibold text-slate-700">{currentPersona?.label ?? t("persona.trigger")}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
