"use client";

import { useState } from "react";
import { Clock, Mail, RotateCw, Send, X } from "lucide-react";
import { apiPost } from "@/lib/api-fetch";
import type { AccessDirectory, AccessInvitation, OrganizationRole, WorkspaceRole } from "./access-types";

interface InvitationAccessPanelProps {
  directory: AccessDirectory;
  invitations: AccessInvitation[];
  locale: string;
  onChanged: () => Promise<void>;
}

export default function InvitationAccessPanel({ directory, invitations, locale, onChanged }: InvitationAccessPanelProps) {
  const zh = locale === "zh";
  const [email, setEmail] = useState("");
  const [organizationRole, setOrganizationRole] = useState<Exclude<OrganizationRole, "owner">>("member");
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiPost<{ success: boolean; error?: { message?: string } }>(
        `/api/organizations/${directory.organizationId}/invitations`,
        { email, organizationRole, workspaceGrants: [{ workspaceId: directory.workspaceId, workspaceRole }] }
      );
      if (!result.success) throw new Error(result.error?.message ?? "Invitation failed");
      setEmail("");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const invitationAction = async (invitationId: string, action: "revoke" | "resend") => {
    setError(null);
    try {
      const result = await apiPost<{ success: boolean; error?: { message?: string } }>(
        `/api/organizations/${directory.organizationId}/invitations/${invitationId}/${action}`
      );
      if (!result.success) throw new Error(result.error?.message ?? "Invitation update failed");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation update failed");
    }
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={invite} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Send size={17} /></span><div><h2 className="text-sm font-bold text-slate-900">{zh ? "邀请人员" : "Invite person"}</h2><p className="text-xs text-slate-500">{zh ? "一次完成组织和工作区授权" : "Grant organization and workspace access together"}</p></div></div>
        {error && <div className="app-error mt-4" role="alert">{error}</div>}
        <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="app-input" placeholder="name@company.com" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{zh ? "组织角色" : "Organization role"}</span><select value={organizationRole} onChange={(event) => setOrganizationRole(event.target.value as Exclude<OrganizationRole, "owner">)} className="app-input"><option value="member">Member</option><option value="admin">Admin</option></select><span className="mt-1 block text-xs text-slate-400">{zh ? "控制组织成员、账单等组织级能力。" : "Controls organization-wide administration."}</span></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{zh ? "当前工作区角色" : "Current workspace role"}</span><select value={workspaceRole} onChange={(event) => setWorkspaceRole(event.target.value as WorkspaceRole)} className="app-input"><option value="viewer">Viewer</option><option value="member">Member</option><option value="admin">Admin</option></select><span className="mt-1 block text-xs text-slate-400">{zh ? "受邀者接受后可以立即进入当前工作区。" : "The person can enter this workspace immediately after accepting."}</span></label>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{zh ? "业务角色在用户接受邀请后，从“人员”中分配。" : "Assign business roles from People after the invitation is accepted."}</div>
          <button type="submit" disabled={submitting} className="app-button-primary w-full">{submitting ? (zh ? "发送中…" : "Sending…") : (zh ? "发送邀请" : "Send invitation")}</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><Clock size={17} className="text-amber-500" /><h2 className="text-sm font-bold text-slate-900">{zh ? "邀请记录" : "Invitations"}</h2><span className="app-badge bg-slate-100 text-slate-600">{invitations.length}</span></header>
        {invitations.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-400">{zh ? "暂无邀请" : "No invitations"}</p> : <ul className="divide-y divide-slate-100">{invitations.map((invitation) => <li key={invitation.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Mail size={16} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{invitation.emailDisplay ?? invitation.emailNormalized}</p><p className="mt-1 text-xs text-slate-500">{invitation.organizationRole} · {invitation.workspaceGrants.map((grant) => `${grant.workspaceName}: ${grant.workspaceRole}`).join(", ") || (zh ? "无工作区授权" : "No workspace access")}</p></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">{invitation.status}</span>{invitation.status === "pending" && <><button type="button" onClick={() => void invitationAction(invitation.id, "resend")} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={zh ? "重新发送" : "Resend"}><RotateCw size={14} /></button><button type="button" onClick={() => void invitationAction(invitation.id, "revoke")} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label={zh ? "撤销" : "Revoke"}><X size={14} /></button></>}</div></li>)}</ul>}
      </div>
    </section>
  );
}
