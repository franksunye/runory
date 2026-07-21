"use client";

import Link from "next/link";
import { LocaleLink } from "@/components/LocaleLink";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export function MarketingHeader({ authenticated = false }: { authenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const copy = marketingCopy[locale].nav;
  const links = [
    { href: "/product", label: copy.product },
    { href: "/solutions", label: copy.solutions },
    { href: "/platform", label: copy.platform },
    { href: "/pricing", label: copy.pricing },
    { href: "/resources", label: copy.resources },
  ];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const switchLocale = (nextLocale: "en" | "zh") => {
    setLocale(nextLocale);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#fbf8f1]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-7xl items-center justify-between px-4 sm:h-[68px] sm:px-6 lg:h-[72px] lg:px-10">
        <LocaleLink href="/" className="flex min-w-0 items-center" aria-label={locale === "zh" ? "Runory 首页" : "Runory home"}>
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-neutral-950 font-semibold text-white">R</span>
          <span className="ml-3 truncate text-lg font-semibold tracking-tight text-neutral-950">Runory</span>
        </LocaleLink>
        <nav className="hidden items-center gap-6 lg:flex" aria-label={t("common.mainNavigation")}>
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return <LocaleLink key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`text-sm font-medium transition hover:text-neutral-950 ${active ? "text-orange-600" : "text-neutral-600"}`}>{link.label}</LocaleLink>;
          })}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <div className="flex items-center rounded-lg border border-black/10 bg-white p-0.5" aria-label={locale === "zh" ? "语言选择" : "Language selector"}>
            {(["en", "zh"] as const).map((item) => <button key={item} type="button" onClick={() => switchLocale(item)} aria-pressed={locale === item} className={`rounded-md px-2 py-1.5 text-xs font-bold ${locale === item ? "bg-neutral-950 text-white" : "text-neutral-500"}`}>{item === "en" ? "EN" : "中文"}</button>)}
          </div>
          <Link href={authenticated ? "/dashboard" : "/pilot"} className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white">{authenticated ? copy.workspace : copy.pilot}</Link>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="grid size-11 shrink-0 place-items-center rounded-xl text-neutral-700 lg:hidden" aria-expanded={open} aria-controls="mobile-marketing-navigation" aria-label={t("common.toggleNavigation")}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      {open && <div id="mobile-marketing-navigation" className="fixed inset-x-0 top-[64px] z-50 h-[calc(100dvh-64px)] overflow-y-auto border-t border-black/10 bg-[#fbf8f1] sm:top-[68px] sm:h-[calc(100dvh-68px)] lg:hidden"><nav className="mx-auto grid max-w-7xl gap-1 px-4 py-5 sm:px-6">{links.map((link) => { const active = pathname === link.href || pathname.startsWith(`${link.href}/`); return <LocaleLink key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`rounded-xl px-3 py-3.5 text-base font-semibold hover:bg-black/5 ${active ? "bg-orange-50 text-orange-700" : "text-neutral-800"}`}>{link.label}</LocaleLink>; })}<div className="mt-4 flex gap-2 border-t border-black/10 px-3 pt-5">{(["en", "zh"] as const).map((item) => <button key={item} type="button" onClick={() => switchLocale(item)} aria-pressed={locale === item} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-bold ${locale === item ? "bg-neutral-950 text-white" : "border border-black/10 bg-white text-neutral-600"}`}>{item === "en" ? "English" : "中文"}</button>)}</div><Link href={authenticated ? "/dashboard" : "/pilot"} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white">{authenticated ? copy.workspace : copy.pilot}</Link></nav></div>}
    </header>
  );
}
