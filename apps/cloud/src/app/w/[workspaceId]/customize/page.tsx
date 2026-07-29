"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ListChecks, Plus } from "lucide-react";
import AddFieldWizard from "@/components/customize/AddFieldWizard";
import ExtensionList from "@/components/customize/ExtensionList";
import { useI18n } from "@/i18n/locale-provider";
import AdministrationPageHeader from "@/components/administration/AdministrationPageHeader";

type Tab = "add" | "installed";

export default function CustomizePage() {
  const workspaceId = useParams().workspaceId as string;
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("add");

  return (
    <div className="space-y-6">
      <AdministrationPageHeader
        workspaceId={workspaceId}
        eyebrow={locale === "zh" ? "对象与字段" : "Objects & fields"}
        title={t("customize.title")}
        description={t("customize.subtitle")}
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <button
          type="button"
          onClick={() => setTab("add")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            tab === "add"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Plus size={16} />
          {t("customize.addField")}
        </button>
        <button
          type="button"
          onClick={() => setTab("installed")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            tab === "installed"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <ListChecks size={16} />
          {t("customize.installedExtensions")}
        </button>
      </div>

      {tab === "add" ? <AddFieldWizard /> : <ExtensionList />}
    </div>
  );
}
