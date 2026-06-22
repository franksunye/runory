"use client";

import Link from "next/link";
import { GitBranch } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

export function MarketingFooter() {
  const { t } = useI18n();
  const groups = [
    { title: t("common.product"), links: [[t("common.product"), "/#product"], [t("common.pricing"), "/pricing"], [t("common.cloudPreview"), "/login"]] },
    { title: t("common.developers"), links: [[t("common.openSource"), "/open-source"], ["GitHub", "https://github.com/franksunye/runory"], [t("common.docs"), "https://github.com/franksunye/runory/tree/main/docs"], [t("common.releases"), "https://github.com/franksunye/runory/releases"]] },
    { title: t("common.architecture"), links: [["SaaS Core", "https://github.com/franksunye/runory/blob/main/docs/07-saas-core-boundaries.md"], ["Catalog & Release", "https://github.com/franksunye/runory/blob/main/docs/09-catalog-release-control-plane.md"], ["SDK", "https://github.com/franksunye/runory/blob/main/docs/10-runory-sdk-product.md"]] },
  ];
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <Link href="/" className="flex items-center">
            <span className="grid size-9 place-items-center rounded-[10px] bg-slate-950 font-bold text-white">R</span>
            <span className="ml-3 text-lg font-bold tracking-tight">Runory</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">{t("footer.description")}</p>
          <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">
            <GitBranch size={17} /> {t("common.github")}
          </Link>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="text-sm font-bold text-slate-950">{group.title}</h2>
            <ul className="mt-4 space-y-3">
              {group.links.map(([label, href]) => {
                const external = href.startsWith("http");
                return (
                  <li key={href}>
                    <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="text-sm text-slate-500 hover:text-slate-950">
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-slate-100 px-6 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <p>{t("footer.copyright")}</p>
        <p>Tell it. Run it.</p>
      </div>
    </footer>
  );
}
