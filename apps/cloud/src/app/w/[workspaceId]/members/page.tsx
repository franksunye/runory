"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
  KeyRound,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

type OrgRole = "owner" | "admin" | "member";

interface OrgMember {
  userId: string;
  email: string | null;
  displayName: string;
  role: OrgRole;
  membershipId: string;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  invitedBy: string;
}

const ROLE_LABEL_KEYS: Record<OrgRole, MessageKey> = {
  owner: "members.role.owner",
  admin: "members.role.admin",
  member: "members.role.member",
};

const ROLE_BADGE_CLASS: Record<OrgRole, string> = {
  owner: "bg-indigo-50 text-indigo-700",
  admin: "bg-blue-50 text-blue-700",
  member: "bg-slate-100 text-slate-600",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

// v0.3.6 — Pack permission groups
interface PermissionGroup {
  id: string;
  packId: string;
  groupKey: string;
  label: string;
  description: string | null;
  permissions: string[];
}

interface GroupAssignment {
  id: string;
  groupId: string;
  userId: string;
  assignedAt: string;
}

export default function MembersPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<OrgRole | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);

  // Action tracking
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);

  // Confirmation state
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null);

  // v0.3.6 — Pack permission groups state
  const [permGroups, setPermGroups] = useState<PermissionGroup[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<Record<string, GroupAssignment[]>>({});
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [assigningGroupId, setAssigningGroupId] = useState<string | null>(null);

  const canManage = currentRole === "owner" || currentRole === "admin";

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const wsRes = await fetch(`/api/workspaces/${workspaceId}`);
      const wsJson = await wsRes.json();
      if (!wsJson.success || !wsJson.data.organizationId) {
        throw new Error(wsJson.error?.message ?? t("members.orgInfoFailed"));
      }
      const organizationId = wsJson.data.organizationId as string;
      setOrgId(organizationId);
      setCurrentRole((wsJson.data.organizationRole as OrgRole) ?? "member");

      const [membersRes, invitationsRes, groupsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/members`),
        fetch(`/api/organizations/${organizationId}/invitations`),
        fetch(`/api/workspaces/${workspaceId}/permission-groups`),
      ]);
      const membersJson = await membersRes.json();
      const invitationsJson = await invitationsRes.json();
      const groupsJson = await groupsRes.json();
      if (membersJson.success) setMembers(membersJson.data);
      if (invitationsJson.success) setInvitations(invitationsJson.data);
      if (groupsJson.success) {
        setPermGroups(groupsJson.data);
        // Load assignments for each group
        const assignmentMap: Record<string, GroupAssignment[]> = {};
        await Promise.all(
          groupsJson.data.map(async (g: PermissionGroup) => {
            const aRes = await fetch(`/api/workspaces/${workspaceId}/permission-groups/${g.id}/assignments`);
            const aJson = await aRes.json();
            if (aJson.success) assignmentMap[g.id] = aJson.data;
          })
        );
        setGroupAssignments(assignmentMap);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setInviting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email: inviteEmail, organizationRole: inviteRole }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(t("members.inviteSent", { email: inviteEmail }));
        setInviteEmail("");
        setInviteRole("member");
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.inviteFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.inviteFailed"));
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invId: string) => {
    if (!orgId) return;
    setRevokingId(invId);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/invitations/${invId}/revoke`,
        { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
      if (json.success) {
        setMessage(t("members.inviteRevoked"));
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.revokeFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.revokeFailed"));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!orgId) return;
    setRemovingUserId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${userId}`,
        { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
      if (json.success) {
        setMessage(t("members.memberRemoved"));
        setConfirmRemove(null);
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.removeFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.removeFailed"));
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: "member" | "admin") => {
    if (!orgId) return;
    setChangingRoleUserId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setMessage(t("members.roleUpdated"));
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.updateRoleFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.updateRoleFailed"));
    } finally {
      setChangingRoleUserId(null);
    }
  };

  // v0.3.6 — Pack permission group assignment handlers
  const handleAssignGroup = async (groupId: string, userId: string) => {
    setAssigningGroupId(groupId);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/permission-groups/${groupId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (json.success) {
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.assignGroupFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.assignGroupFailed"));
    } finally {
      setAssigningGroupId(null);
    }
  };

  const handleRemoveGroupAssignment = async (groupId: string, userId: string) => {
    setAssigningGroupId(groupId);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/permission-groups/${groupId}/assignments?userId=${userId}`,
        { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
      if (json.success) {
        await loadData();
      } else {
        setError(json.error?.message ?? t("members.removeGroupFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.removeGroupFailed"));
    } finally {
      setAssigningGroupId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Members</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{t("members.title")}</h1>
        </header>
        <div className="app-card p-8 text-center">
          <ShieldCheck size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {t("members.noPermission")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Members</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{t("members.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("members.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Invite form */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">{t("members.inviteNew")}</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("members.emailLabel")}</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("members.roleLabel")}</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="member">{t("members.role.member")}</option>
              <option value="admin">{t("members.role.admin")}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="app-button-primary"
          >
            {inviting ? t("members.sending") : t("members.sendInvite")}
          </button>
        </form>
      </section>

      {/* Pending invitations */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">{t("members.pendingInvites")}</h2>
            <span className="app-badge bg-amber-50 text-amber-700">{invitations.length}</span>
          </div>
        </div>
        {invitations.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t("members.noPending")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600">
                    <Mail size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{inv.email}</p>
                    <p className="text-xs text-slate-500">
                      {t("members.invitationMeta", { role: t(ROLE_LABEL_KEYS[inv.role]), status: inv.status, expires: formatDate(inv.expiresAt) })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {inv.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleRevokeInvitation(inv.id)}
                      disabled={revokingId === inv.id}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <X size={14} />
                      {revokingId === inv.id ? t("members.revoking") : t("members.revokeInvite")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Members list */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">{t("members.memberList")}</h2>
          <span className="app-badge bg-slate-100 text-slate-600">{members.length}</span>
        </div>
        {members.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t("members.noMembers")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => {
              const isOwner = m.role === "owner";
              return (
                <li key={m.userId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">
                      {(m.displayName || m.email || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {m.displayName}
                        {m.email && <span className="ml-2 text-xs font-normal text-slate-400">{m.email}</span>}
                      </p>
                      <p className="text-xs text-slate-500">{t("members.joinedAt", { time: formatDate(m.joinedAt) })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <span className={`app-badge ${ROLE_BADGE_CLASS[m.role]}`}>
                        <ShieldCheck size={14} />{t(ROLE_LABEL_KEYS[m.role])}
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.userId, e.target.value as "member" | "admin")}
                        disabled={changingRoleUserId === m.userId}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                      >
                        <option value="member">{t("members.role.member")}</option>
                        <option value="admin">{t("members.role.admin")}</option>
                      </select>
                    )}
                    {!isOwner && (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(m)}
                        disabled={removingUserId === m.userId}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <UserMinus size={14} />
                        {removingUserId === m.userId ? t("members.removing") : t("members.remove")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Pack permission groups (v0.3.6) */}
      {permGroups.length > 0 && (
        <section className="app-card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">{t("members.permGroups")}</h2>
            <span className="app-badge bg-slate-100 text-slate-600">{permGroups.length}</span>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            {t("members.permGroupsHint")}
          </p>
          <div className="space-y-4">
            {permGroups.map((group) => {
              const assignments = groupAssignments[group.id] ?? [];
              const assignedUserIds = new Set(assignments.map(a => a.userId));
              return (
                <div key={group.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{group.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {group.description ?? group.groupKey} · {group.packId}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {group.permissions.slice(0, 5).map((p) => (
                          <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">{p}</span>
                        ))}
                        {group.permissions.length > 5 && (
                          <span className="text-[10px] text-slate-400">+{group.permissions.length - 5} more</span>
                        )}
                      </div>
                    </div>
                    <span className="app-badge bg-indigo-50 text-indigo-700">{t("members.assigneesCount", { count: assignments.length })}</span>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">{t("members.assignMembers")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => {
                        const isAssigned = assignedUserIds.has(m.userId);
                        return (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() =>
                              isAssigned
                                ? handleRemoveGroupAssignment(group.id, m.userId)
                                : handleAssignGroup(group.id, m.userId)
                            }
                            disabled={assigningGroupId === group.id}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                              isAssigned
                                ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {m.displayName}{isAssigned && " ✓"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={20} />
              </span>
              <h3 className="text-base font-bold text-slate-900">{t("members.removeMember")}</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {t("members.removeConfirmPrefix")}<span className="font-semibold text-slate-800">{confirmRemove.displayName}</span>{t("members.removeConfirmSuffix")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="app-button-secondary"
              >
                {t("workspace.cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveMember(confirmRemove.userId)}
                disabled={removingUserId === confirmRemove.userId}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                {removingUserId === confirmRemove.userId ? t("members.removing") : t("members.confirmRemove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
