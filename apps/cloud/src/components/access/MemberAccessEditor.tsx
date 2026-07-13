"use client";

import { useMemo, useState } from "react";
import { Check, ShieldCheck, Trash2 } from "lucide-react";
import { apiDelete, apiPatch } from "@/lib/api-fetch";
import type { AccessDirectory, AccessMember, OrganizationRole, WorkspaceRole } from "./access-types";

interface MemberAccessEditorProps {
  directory: AccessDirectory;
  member: AccessMember;
  locale: string;
  onCancel: () => void;
  onCompleted: () => void;
}

export default function MemberAccessEditor({ directory, member, locale, onCancel, onCompleted }: MemberAccessEditorProps) {
  const zh = locale === "zh";
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(member.organizationRole);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | "none">(member.workspaceRole ?? "none");
  const [businessRoleIds, setBusinessRoleIds] = useState<Set<string>>(new Set(member.businessRoles.map((role) => role.id)));
  const [resourceIds, setResourceIds] = useState<Set<string>>(new Set(member.resources.map((resource) => resource.id)));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberNamesById = useMemo(
    () => new Map(directory.members.map((item) => [item.userId, item.displayName])),
    [directory.members]
  );
  const technicianRole = directory.roles.find((role) => role.groupKey === "field_technician");
  const hasTechnicianRole = Boolean(technicianRole && businessRoleIds.has(technicianRole.id));
  const technicianResources = directory.resources.filter((resource) => resource.type === "technician");
  const hasInheritedWorkspaceAdmin = member.organizationRole === "owner" || member.organizationRole === "admin";
  const canRemoveFromOrganization = Boolean(
    member.organizationRole
      && member.organizationRole !== "owner"
      && member.userId !== directory.currentUserId
      && (directory.currentOrganizationRole === "owner"
        || (directory.currentOrganizationRole === "admin" && member.organizationRole === "member"))
  );

  const changeWorkspaceRole = (nextRole: WorkspaceRole | "none") => {
    setWorkspaceRole(nextRole);
    if (nextRole === "none") {
      setBusinessRoleIds(new Set());
      setResourceIds(new Set());
    }
  };

  const toggleBusinessRole = (roleId: string, groupKey: string) => {
    const next = new Set(businessRoleIds);
    const removingRole = next.has(roleId);
    if (removingRole) next.delete(roleId);
    else next.add(roleId);
    setBusinessRoleIds(next);
    if (removingRole && groupKey === "field_technician") setResourceIds(new Set());
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await apiPatch<{ success: boolean; error?: { message?: string } }>(
        `/api/workspaces/${directory.workspaceId}/access/members/${member.userId}`,
        {
          ...(organizationRole && organizationRole !== "owner" && organizationRole !== member.organizationRole
            ? { organizationRole }
            : {}),
          ...(member.userId === directory.currentUserId || member.organizationRole === "owner" || member.organizationRole === "admin"
            ? {}
            : { workspaceRole: workspaceRole === "none" ? null : workspaceRole }),
          businessRoleIds: [...businessRoleIds],
          resourceIds: [...resourceIds],
        }
      );
      if (!result.success) throw new Error(result.error?.message ?? "Access update failed");
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Access update failed");
    } finally {
      setSaving(false);
    }
  };

  const removeFromOrganization = async () => {
    setRemoving(true);
    setError(null);
    try {
      const result = await apiDelete<{ success: boolean; error?: { message?: string } }>(
        `/api/organizations/${directory.organizationId}/members/${member.userId}`
      );
      if (!result.success) throw new Error(result.error?.message ?? "Member removal failed");
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Member removal failed");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="app-error" role="alert">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-6">
          <section className="app-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-950">{zh ? "成员身份" : "Member identity"}</h2>
            <p className="mt-1 text-sm text-slate-500">{zh ? "定义该人员在组织和当前工作区中的基础访问级别。" : "Define this person's base access to the organization and current workspace."}</p>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{zh ? "组织身份" : "Organization identity"}</p>
                {member.organizationRole && member.organizationRole !== "owner" && directory.currentOrganizationRole === "owner"
                  ? <select value={organizationRole ?? "member"} onChange={(event) => setOrganizationRole(event.target.value as "admin" | "member")} className="app-input mt-2"><option value="member">Member</option><option value="admin">Admin</option></select>
                  : <div className="mt-2 rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{member.organizationRole ?? (zh ? "仅工作区成员" : "Workspace-only member")}</div>}
                <p className="mt-2 text-xs leading-5 text-slate-500">{zh ? "组织角色控制成员管理和组织级设置；所有权必须通过独立流程转移。" : "Controls organization administration. Ownership uses a separate transfer flow."}</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-400" htmlFor="workspace-role">{zh ? "当前工作区角色" : "Workspace role"}</label>
                <select id="workspace-role" value={workspaceRole} disabled={member.userId === directory.currentUserId || hasInheritedWorkspaceAdmin} onChange={(event) => changeWorkspaceRole(event.target.value as WorkspaceRole | "none")} className="app-input mt-2 disabled:cursor-not-allowed disabled:opacity-60"><option value="none">{zh ? "无工作区访问" : "No workspace access"}</option><option value="viewer">Viewer</option><option value="member">Member</option><option value="admin">Admin</option></select>
                <p className="mt-2 text-xs leading-5 text-slate-500">{hasInheritedWorkspaceAdmin ? (zh ? "该人员通过组织 Owner/Admin 身份继承所有工作区的管理员访问。" : "This person inherits administrator access to every workspace from their organization role.") : member.userId === directory.currentUserId ? (zh ? "为避免锁定当前会话，不能在这里修改自己的工作区访问。" : "You cannot change your own workspace access here.") : (zh ? "决定是否能进入、查看或管理这个工作区。" : "Controls entry, basic editing, and workspace administration.")}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-900"><ShieldCheck size={17} />{zh ? "有效访问说明" : "Effective access"}</div>
            <p className="mt-2 text-sm leading-6 text-indigo-800">{zh ? "工作区角色决定能否进入和管理；业务角色决定可执行的业务操作；资源身份决定本人分配的数据范围。" : "Workspace role controls entry and administration; business roles grant actions; resource identity constrains assigned data."}</p>
          </section>

          {canRemoveFromOrganization && <section className="rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6"><div className="flex items-center gap-2 text-sm font-bold text-red-800"><Trash2 size={16} />{zh ? "危险操作" : "Danger zone"}</div><p className="mt-2 text-sm leading-6 text-red-700">{zh ? "从组织移除后，该人员将失去所有工作区成员身份，当前登录会话也会结束。" : "Removing this person revokes membership across every workspace and ends active sessions."}</p>{confirmingRemoval ? <div className="mt-4 flex items-center gap-2"><button type="button" onClick={() => setConfirmingRemoval(false)} className="app-button-secondary">{zh ? "取消" : "Cancel"}</button><button type="button" onClick={() => void removeFromOrganization()} disabled={removing} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{removing ? (zh ? "移除中…" : "Removing…") : (zh ? "确认移除" : "Confirm removal")}</button></div> : <button type="button" onClick={() => setConfirmingRemoval(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"><Trash2 size={14} />{zh ? "从组织移除成员…" : "Remove from organization…"}</button>}</section>}
        </div>

        <div className="space-y-6">
          <section className="app-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-950">{zh ? "业务角色" : "Business roles"}</h2>
            <p className="mt-1 text-sm text-slate-500">{zh ? "角色决定该人员可以执行哪些业务操作。" : "Roles determine which business actions this person can perform."}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{directory.roles.map((role) => { const checked = businessRoleIds.has(role.id); const disabled = workspaceRole === "none"; return <label key={role.id} className={`flex items-start gap-3 rounded-lg border p-4 ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60" : checked ? "cursor-pointer border-indigo-300 bg-indigo-50/60" : "cursor-pointer border-slate-200 hover:bg-slate-50"}`}><input type="checkbox" disabled={disabled} checked={checked} onChange={() => toggleBusinessRole(role.id, role.groupKey)} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-800">{role.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{role.description ?? role.packId}</span></span></label>; })}</div>
          </section>

          {hasTechnicianRole && <section className="app-card p-5 sm:p-6"><h2 className="text-base font-bold text-slate-950">{zh ? "现场服务人员身份" : "Field service identity"}</h2><p className="mt-1 text-sm text-slate-500">{zh ? "将登录用户关联到唯一的 Technician 资源，用于工单、My Work 和排程的数据归属。" : "Link this login to a technician resource for work orders, My Work, and scheduling."}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{technicianResources.map((resource) => { const checked = resourceIds.has(resource.id); const ownedByOther = Boolean(resource.userId && resource.userId !== member.userId); const ownerName = resource.userId ? memberNamesById.get(resource.userId) : null; return <label key={resource.id} className={`flex items-center gap-3 rounded-lg border p-4 ${ownedByOther ? "cursor-not-allowed border-amber-200 bg-amber-50" : checked ? "cursor-pointer border-indigo-300 bg-indigo-50/60" : "cursor-pointer border-slate-200 hover:bg-slate-50"}`}><input type="checkbox" disabled={ownedByOther} checked={checked} onChange={() => setResourceIds((current) => { const next = new Set(current); if (next.has(resource.id)) next.delete(resource.id); else next.add(resource.id); return next; })} /><span className="text-sm font-medium text-slate-800">{resource.name}</span><span className={`ml-auto text-xs ${ownedByOther ? "font-medium text-amber-700" : "text-slate-400"}`}>{ownedByOther ? (zh ? `已绑定给 ${ownerName ?? "其他用户"}` : `Assigned to ${ownerName ?? "another user"}`) : checked ? (zh ? "当前身份" : "Current identity") : (zh ? "可绑定" : "Available")}</span></label>; })}</div><p className="mt-3 text-xs text-slate-400">{zh ? "已绑定资源需要先在原用户处解除，避免工单和排程归属被静默转移。" : "Release an assigned resource from its current user before reassigning it."}</p></section>}
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-slate-200 pt-5">
        <button type="button" onClick={onCancel} className="app-button-secondary">{zh ? "取消" : "Cancel"}</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="app-button-primary">{saving ? (zh ? "保存中…" : "Saving…") : <><Check size={16} />{zh ? "保存访问设置" : "Save access"}</>}</button>
      </footer>
    </div>
  );
}
