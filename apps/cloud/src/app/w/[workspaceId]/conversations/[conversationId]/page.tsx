"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, CheckCircle2, Clock3, Mail, Phone, UserRound, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";

export default function ConversationDetailPage() {
  const { workspaceId, conversationId } = useParams() as { workspaceId: string; conversationId: string };
  const { data, isLoading } = useSWR(
    `/api/workspaces/${workspaceId}/conversations/${conversationId}`,
    (url) => apiFetch<{ data: { conversation: Row; participants: Row[]; messages: Row[]; deliveries: Row[] } }>(url),
  );
  const payload = data?.data;
  if (isLoading) return <div className="app-card p-8 text-sm text-slate-500">Loading conversation…</div>;
  if (!payload?.conversation) return <div className="app-card p-8">Conversation not found.</div>;

  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href={`/w/${workspaceId}/conversations`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft size={15} />Back to conversations</Link>
    <section className="app-card p-5">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{text(payload.conversation.status)}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-950">{text(payload.conversation.subject) || "Customer conversation"}</h1>
      <div className="mt-4 flex flex-wrap gap-2">{payload.participants.map((participant) => <span key={text(participant.id)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"><UserRound size={12} />{text(participant.display_name) || text(participant.address) || text(participant.participant_type)}</span>)}</div>
    </section>
    <section className="app-card divide-y divide-slate-100">
      {payload.messages.map((message) => {
        const delivery = payload.deliveries.find((item) => text(item.message_id) === text(message.id));
        const status = text(delivery?.status);
        const icon = status === "accepted" || status === "delivered" ? <CheckCircle2 size={14} className="text-emerald-600" /> : status === "failed" ? <XCircle size={14} className="text-red-600" /> : <Clock3 size={14} className="text-amber-600" />;
        return <article key={text(message.id)} className="p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">{text(message.channel) === "voice" ? <Phone size={14} /> : <Mail size={14} />}<span>{text(message.direction)} · {text(message.created_at)}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{text(message.body_text)}</p>
          {delivery && <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">{icon}<span>{text(delivery.channel)} · {status} · {text(delivery.recipient_address)}</span></div>}
        </article>;
      })}
    </section>
  </div>;
}
