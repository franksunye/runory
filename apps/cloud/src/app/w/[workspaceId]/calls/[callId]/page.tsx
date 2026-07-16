"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Headphones, PhoneCall } from "lucide-react";
import { useRecord } from "@/lib/api-hooks";

const value = (input: unknown) => typeof input === "string" || typeof input === "number" ? String(input) : "—";

export default function VoiceCallDetailPage() {
  const { workspaceId, callId } = useParams<{ workspaceId: string; callId: string }>();
  const { data: call, isLoading } = useRecord(workspaceId, "voice_call", callId);
  if (isLoading) return <div className="space-y-4"><div className="app-skeleton h-8 w-52" /><div className="app-skeleton h-64 w-full" /></div>;
  if (!call) return <div className="app-card p-8 text-sm text-slate-500">This voice call is unavailable.</div>;
  const recording = typeof call.recording_reference === "string" ? `/api/workspaces/${workspaceId}/voice-calls/${callId}/recording` : "";
  const transcript = typeof call.transcript_text === "string" ? call.transcript_text : "";
  return <div className="mx-auto max-w-5xl space-y-6 page-enter">
    <Link href={`/w/${workspaceId}/calls`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft size={15} />Back to calls</Link>
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="app-eyebrow">Voice call</p><h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-[-.025em] text-slate-950"><PhoneCall size={26} />{value(call.caller_phone)}</h1><p className="mt-2 text-sm text-slate-500">{value(call.status)} · {value(call.duration_seconds)} seconds · {value(call.outcome)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{value(call.review_status)}</span></header>
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div className="space-y-6"><section className="app-card p-5"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Headphones size={18} />Recording</h2>{recording ? <audio className="mt-4 w-full" controls preload="metadata" src={recording}>Your browser does not support audio playback.</audio> : <p className="mt-3 text-sm text-slate-500">No recording is available for this call.</p>}</section><section className="app-card p-5"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileText size={18} />Transcript</h2>{transcript ? <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-sans text-sm leading-6 text-slate-100">{transcript}</pre> : <p className="mt-3 text-sm text-slate-500">The provider has not supplied a transcript yet.</p>}</section></div><aside className="space-y-6"><section className="app-card p-5"><h2 className="font-semibold text-slate-900">AI summary</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{value(call.summary)}</p></section><section className="app-card p-5"><h2 className="font-semibold text-slate-900">Linked records</h2><dl className="mt-3 space-y-3 text-sm">{[["Contact", "contact_id", "contacts"], ["Service site", "service_site_id", "service-sites"], ["Work order", "work_order_id", "work-orders"]].map(([label, field, route]) => <div key={field} className="flex items-center justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd>{call[field] ? <Link className="font-medium text-indigo-700 hover:underline" href={`/w/${workspaceId}/${route}/${call[field]}`}>{String(call[field]).slice(0, 12)}…</Link> : "—"}</dd></div>)}</dl></section></aside></div>
  </div>;
}
