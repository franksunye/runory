"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import AddFieldWizard from "@/components/customize/AddFieldWizard";
import ExtensionList from "@/components/customize/ExtensionList";

type Tab = "add" | "installed";

export default function CustomizePage() {
  const workspaceId = useParams().workspaceId as string;
  const [tab, setTab] = useState<Tab>("add");

  return (
    <div className="space-y-6">
      <header>
        <p className="app-eyebrow">Customize</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
          定制工作区
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          通过引导式流程添加自定义字段，无需编辑 JSON。所有变更遵循
          计划 → 预览 → 应用 → 审计 → 回滚 的安全治理流程。
        </p>
      </header>

      <Link
        href={`/w/${workspaceId}/manage`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft size={14} />
        返回管理
      </Link>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
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
          添加字段
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
          已安装扩展
        </button>
      </div>

      {tab === "add" ? <AddFieldWizard /> : <ExtensionList />}
    </div>
  );
}
