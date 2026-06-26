"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Menu, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/locale-provider";
import { SITE_CONFIG } from "@/lib/site";

export function MarketingHeader({ authenticated = false }: { authenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const links: { href: string; label: string; external?: boolean }[] = [
    { href: "/#product", label: t("common.product") },
    { href: "/open-source", label: t("common.openSource") },
    { href: "/pricing", label: t("common.pricing") },
    { href: "/packs", label: t("common.packs") },
    { href: "/docs", label: t("common.docs") },
  ];

  return (
    <header className="relative z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center" aria-label="Runory home">
          <span className="grid size-9 place-items-center rounded-[10px] bg-slate-950 font-bold text-white">R</span>
          <span className="ml-3 text-lg font-bold tracking-tight">Runory</span>
          <span className="ml-3 hidden rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 sm:block">0.1 Preview</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label={t("common.mainNavigation")}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              className={`text-sm font-medium transition hover:text-slate-950 ${pathname === link.href ? "text-indigo-600" : "text-slate-600"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={SITE_CONFIG.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="grid size-10 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Runory GitHub"
          >
            <GitBranch size={19} />
          </Link>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5" aria-label={t("common.language")}>
            {(["en", "zh"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setLocale(item)} className={`rounded-md px-2 py-1.5 text-xs font-bold transition ${locale === item ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-950"}`} aria-pressed={locale === item}>
                {item === "en" ? "EN" : t("common.langZh")}
              </button>
            ))}
          </div>
          <Link href={authenticated ? "/dashboard" : "/login"} className="app-button-primary">
            {authenticated ? t("common.workspace") : t("common.startFree")}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid size-10 place-items-center rounded-lg text-slate-700 md:hidden"
          aria-expanded={open}
          aria-label={t("common.toggleNavigation")}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-6 py-5 md:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1" aria-label={t("common.mobileNavigation")}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-2 flex gap-2 px-3">
              {(["en", "zh"] as const).map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${locale === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item === "en" ? "English" : t("common.langZh")}</button>)}
            </div>
            <Link href={authenticated ? "/dashboard" : "/login"} className="app-button-primary mt-3">
              {authenticated ? t("common.workspace") : t("common.startFree")}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
