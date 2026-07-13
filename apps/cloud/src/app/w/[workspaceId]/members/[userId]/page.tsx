"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import MemberAccessEditor from "@/components/access/MemberAccessEditor";
import type { AccessDirectory } from "@/components/access/access-types";
import { apiFetch } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";

export default function MemberAccessPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceRef = params.workspaceId as string;
  const userId = params.userId as string;
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listPath = `/w/${workspaceRef}/members`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ success: boolean; data?: AccessDirectory; error?: { message?: string } }>(
        `/api/workspaces/${workspaceRef}/access/members`,
        { cache: "no-store" }
      );
      if (!result.success || !result.data) throw new Error(result.error?.message ?? "Unable to load member access");
      setDirectory(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load member access");
    } finally {
      setLoading(false);
    }
  }, [workspaceRef]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="space-y-4"><div className="app-skeleton h-10 w-72" /><div className="app-skeleton h-96 w-full" /></div>;
  const member = directory?.members.find((item) => item.userId === userId);
  if (error || !directory || !member) return <div className="app-card p-8 text-center"><ShieldCheck size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-red-600">{error ?? (zh ? "找不到该成员" : "Member not found")}</p><button type="button" onClick={() => router.push(listPath)} className="app-button-secondary mt-5">{zh ? "返回人员目录" : "Back to people"}</button></div>;

  return (
    <div className="space-y-6 page-enter">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => router.push(listPath)} className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" title={zh ? "返回人员目录" : "Back to people"} aria-label={zh ? "返回人员目录" : "Back to people"}><ArrowLeft size={18} /></button>
        <span className="grid size-11 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{member.displayName.slice(0, 1).toUpperCase()}</span>
        <div><p className="app-eyebrow">{zh ? "成员访问设置" : "Member access"}</p><h1 className="mt-1 text-2xl font-bold tracking-[-.025em] text-slate-950">{member.displayName}</h1><p className="mt-1 text-sm text-slate-500">{member.email ?? (zh ? "演示身份" : "Demo identity")}</p></div>
      </header>

      <MemberAccessEditor directory={directory} member={member} locale={locale} onCancel={() => router.push(listPath)} onCompleted={() => router.push(listPath)} />
    </div>
  );
}
