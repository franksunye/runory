"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

interface AdministrationPageHeaderProps {
  workspaceId: string;
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export default function AdministrationPageHeader({
  workspaceId,
  eyebrow,
  title,
  description,
  actions,
}: AdministrationPageHeaderProps) {
  const { locale } = useI18n();
  return (
    <header className="border-b border-slate-200/80 pb-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Link href={`/w/${workspaceId}/manage`} className="transition hover:text-indigo-600">
          {locale === "zh" ? "管理中心" : "Administration"}
        </Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span className="text-slate-600" aria-current="page">{eyebrow}</span>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="app-eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.025em] text-slate-950 sm:text-[28px]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">{actions}</div> : null}
      </div>
    </header>
  );
}
