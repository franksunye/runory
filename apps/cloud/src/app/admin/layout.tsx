"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

const NAV_ITEMS: { href: string; label: MessageKey; match: (p: string) => boolean }[] = [
  { href: "/admin", label: "admin.nav.overview", match: (p: string) => p === "/admin" },
  { href: "/admin?tab=catalog", label: "admin.nav.catalog", match: (p: string) => p.startsWith("/admin/catalog") },
  { href: "/admin/releases", label: "admin.nav.releases", match: (p: string) => p.startsWith("/admin/releases") },
  { href: "/admin/rollouts", label: "admin.nav.rollouts", match: (p: string) => p.startsWith("/admin/rollouts") },
  { href: "/admin/migrations", label: "admin.nav.migrations", match: (p: string) => p.startsWith("/admin/migrations") },
  { href: "/admin/installations", label: "admin.nav.installations", match: (p: string) => p.startsWith("/admin/installations") },
  { href: "/admin/audit", label: "admin.nav.audit", match: (p: string) => p.startsWith("/admin/audit") },
  { href: "/admin/entitlements", label: "admin.nav.entitlements", match: (p: string) => p.startsWith("/admin/entitlements") },
  { href: "/admin/workspaces", label: "admin.nav.workspaces", match: (p: string) => p.startsWith("/admin/workspaces") },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[#f7f8fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-slate-950 font-bold text-white">R</div>
            <span className="text-base font-bold tracking-tight">Runory</span>
            <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">Platform Console</span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={15} /> {t("admin.nav.backToWorkspace")}
          </Link>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-6">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
    </div>
  );
}
