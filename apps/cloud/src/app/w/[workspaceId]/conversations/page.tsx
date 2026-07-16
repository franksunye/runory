"use client";
import useSWR from "swr";
import Link from "next/link";
import { MessageCircle, Mail, Phone, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const statusIcon = (status: string) => status === "accepted" || status === "delivered" ? <CheckCircle2 size={15} className="text-emerald-600" /> : status === "failed" ? <XCircle size={15} className="text-red-600" /> : <Clock3 size={15} className="text-amber-600" />;

export default function ConversationsPage() {
  const workspaceId = useParams().workspaceId as string;
  const { data, isLoading } = useSWR(`/api/workspaces/${workspaceId}/conversations`, (url) => apiFetch<{ data: { conversations: Row[]; messages: Row[]; deliveries: Row[] } }>(url));
  const payload = data?.data; const conversations = payload?.conversations ?? [];
  return <div className="mx-auto max-w-4xl space-y-5">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Customer communications</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Conversations</h1><p className="mt-1 text-sm text-slate-500">Calls, confirmations and future customer replies in one timeline.</p></div>
    {isLoading ? <div className="app-card p-8 text-sm text-slate-500">Loading conversations…</div> : conversations.length === 0 ? <div className="app-card p-12 text-center"><MessageCircle className="mx-auto text-slate-300" size={32}/><p className="mt-3 font-semibold text-slate-700">No conversations yet</p></div> : conversations.map(conversation => {
      const messages = (payload?.messages ?? []).filter(message => text(message.conversation_id) === text(conversation.id));
      return <section key={text(conversation.id)} className="app-card overflow-hidden"><Link href={`/w/${workspaceId}/conversations/${text(conversation.id)}`} className="block border-b border-slate-100 p-4 hover:bg-slate-50"><div className="flex items-center gap-2 font-semibold text-slate-900"><MessageCircle size={16}/>{text(conversation.subject) || "Customer conversation"}</div><p className="mt-1 text-xs text-slate-500">{text(conversation.status)} · {text(conversation.last_message_at || conversation.created_at)}</p></Link><div className="divide-y divide-slate-100">{messages.map(message => { const delivery = (payload?.deliveries ?? []).find(item => text(item.message_id) === text(message.id)); return <article key={text(message.id)} className="p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500">{text(message.channel) === "voice" ? <Phone size={14}/> : <Mail size={14}/>} {text(message.direction)} · {text(message.created_at)}</div><p className="mt-2 text-sm text-slate-800">{text(message.body_text)}</p>{delivery && <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">{statusIcon(text(delivery.status))}<span>{text(delivery.channel)} · {text(delivery.status)} · {text(delivery.recipient_address)}</span>{text(delivery.last_error) && <span className="text-red-600">— {text(delivery.last_error)}</span>}</div>}</article>; })}</div></section>; })}
  </div>;
}
