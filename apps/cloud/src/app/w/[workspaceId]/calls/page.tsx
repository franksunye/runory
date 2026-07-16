"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock3, FileText, Headphones, PhoneCall, UserRound } from "lucide-react";
import { useRecords } from "@/lib/api-hooks";

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

export default function CallsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: calls = [], isLoading } = useRecords(workspaceId, "voice_call", { sortBy: "created_at", sortOrder: "desc", limit: 100 });

  return <div className="space-y-6 page-enter">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="app-eyebrow">Voice intake</p><h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">Calls</h1><p className="mt-2 text-sm text-slate-500">Review recordings, transcripts, AI outcomes, and the business records created from every call.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">{calls.length} calls</div>
    </header>
    <div className="app-card overflow-hidden p-0">
      {isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="app-skeleton h-16 w-full" />)}</div> : calls.length === 0 ? <div className="p-12 text-center"><PhoneCall className="mx-auto text-slate-300" size={32} /><p className="mt-3 font-semibold text-slate-800">No voice calls yet</p><p className="mt-1 text-sm text-slate-500">Completed Retell calls will appear here with their intake outcome.</p></div> : <div className="divide-y divide-slate-100">
        {calls.map(call => <Link key={text(call.id)} href={`/w/${workspaceId}/calls/${call.id}`} className="block p-4 transition hover:bg-slate-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><UserRound size={15} className="text-slate-400" />{text(call.caller_phone)}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{text(call.outcome)}</span></div><p className="mt-1 truncate text-sm text-slate-500">{text(call.summary) !== "—" ? text(call.summary) : `Intent: ${text(call.primary_intent)}`}</p></div><div className="flex items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 size={13} />{text(call.duration_seconds)}s</span>{call.recording_reference ? <span className="flex items-center gap-1 text-emerald-700"><Headphones size={13} />Recording</span> : null}{call.transcript_text ? <span className="flex items-center gap-1 text-indigo-700"><FileText size={13} />Transcript</span> : null}</div></div>
        </Link>)}
      </div>}
    </div>
  </div>;
}
