"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/locale-provider";

export function MarketingHeader({ authenticated = false }: { authenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const links = [
    { href: "/product", label: "Product" },
    { href: "/solutions", label: "Solutions" },
    { href: "/platform", label: "Platform" },
    { href: "/pricing", label: "Pricing" },
    { href: "/resources", label: "Resources" },
  ];

  return (
    <header className="relative z-30 border-b border-black/10 bg-[#fbf8f1]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-6 lg:h-[72px] lg:px-10">
        <Link href="/" className="flex items-center" aria-label="Runory home">
          <span className="grid size-9 place-items-center rounded-[10px] bg-neutral-950 font-semibold text-white">R</span>
          <span className="ml-3 text-lg font-semibold tracking-tight text-neutral-950">Runory</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label={t("common.mainNavigation")}>
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return <Link key={link.href} href={link.href} className={`text-sm font-medium transition hover:text-neutral-950 ${active ? "text-orange-600" : "text-neutral-600"}`}>{link.label}</Link>;
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center rounded-lg border border-black/10 bg-white p-0.5">
            {(["en", "zh"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setLocale(item)} className={`rounded-md px-2 py-1.5 text-xs font-bold ${locale === item ? "bg-neutral-950 text-white" : "text-neutral-500"}`}>
                {item === "en" ? "EN" : t("common.langZh")}
              </button>
            ))}
          </div>
          <Link href={authenticated ? "/dashboard" : "/pilot"} className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white">
            {authenticated ? t("common.workspace") : "Start a Pilot"}
          </Link>
        </div>

        <button type="button" onClick={() => setOpen((value) => !value)} className="grid size-10 place-items-center rounded-lg text-neutral-700 md:hidden" aria-expanded={open} aria-label={t("common.toggleNavigation")}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-black/10 bg-[#fbf8f1] px-5 py-5 md:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1">
            {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-semibold text-neutral-800 hover:bg-black/5">{link.label}</Link>)}
            <div className="mt-3 flex gap-2 px-3">
              {(["en", "zh"] as const).map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${locale === item ? "bg-neutral-950 text-white" : "border border-black/10 bg-white text-neutral-600"}`}>{item === "en" ? "English" : t("common.langZh")}</button>)}
            </div>
            <Link href={authenticated ? "/dashboard" : "/pilot"} onClick={() => setOpen(false)} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white">
              {authenticated ? t("common.workspace") : "Start a Pilot"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
