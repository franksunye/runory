"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Check, ChevronDown, Loader2, LogIn } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

interface Persona {
  id: string;
  label: string;
  externalId: string;
  color: string;
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

// Map persona colors to Tailwind classes for the badge dot
const COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  purple: "bg-purple-500",
};

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

export default function PersonaSwitcher() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [current, setCurrent] = useState<string>("dev-local-owner");
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

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
  const isMobileWorkspace = pathname?.startsWith("/m/w/");

  return (
    <div
      ref={dropdownRef}
      className={`fixed right-4 z-[9999] ${isMobileWorkspace ? "bottom-20" : "bottom-4"}`}
    >
      {/* Dropdown panel */}
      {open && (
        <div className="mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("persona.title")}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {t("persona.hint")}
            </p>
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
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive ? "bg-slate-50" : ""
                    }`}
                  >
                      <span
                        className={`inline-block size-2.5 shrink-0 rounded-full ${
                          COLOR_CLASSES[persona.color] ?? "bg-slate-400"
                        }`}
                      />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-700">
                        {persona.label}
                      </span>
                      {descriptionKey && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {t(descriptionKey)}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <Check size={16} className={`shrink-0 ${TEXT_COLOR_CLASSES[persona.color] ?? "text-slate-500"}`} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              onClick={() => setOpen(false)}
            >
              <LogIn size={13} />
              {t("persona.otpLogin")}
            </Link>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              {t("persona.otpLoginHint")}
            </p>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
        title={t("persona.title")}
      >
        {switching ? (
          <Loader2 size={18} className="animate-spin text-slate-500" />
        ) : (
          <Users size={18} className="text-slate-600" />
        )}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2.5 rounded-full ${
              currentPersona ? COLOR_CLASSES[currentPersona.color] ?? "bg-slate-400" : "bg-slate-400"
            }`}
          />
          <span className="text-sm font-semibold text-slate-700">
            {currentPersona?.label ?? t("persona.trigger")}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}
