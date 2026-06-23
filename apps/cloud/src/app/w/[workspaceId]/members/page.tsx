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
} from "lucide-react";

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

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
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

export default function MembersPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

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

  const canManage = currentRole === "owner" || currentRole === "admin";

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const wsRes = await fetch(`/api/workspaces/${workspaceId}`);
      const wsJson = await wsRes.json();
      if (!wsJson.success || !wsJson.data.organizationId) {
        throw new Error(wsJson.error?.message ?? "无法获取组织信息");
      }
      const organizationId = wsJson.data.organizationId as string;
      setOrgId(organizationId);
      setCurrentRole((wsJson.data.organizationRole as OrgRole) ?? "member");

      const [membersRes, invitationsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/members`),
        fetch(`/api/organizations/${organizationId}/invitations`),
      ]);
      const membersJson = await membersRes.json();
      const invitationsJson = await invitationsRes.json();
      if (membersJson.success) setMembers(membersJson.data);
      if (invitationsJson.success) setInvitations(invitationsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
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
        setMessage(`已向 ${inviteEmail} 发送邀请`);
        setInviteEmail("");
        setInviteRole("member");
        await loadData();
      } else {
        setError(json.error?.message ?? "邀请失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "邀请失败");
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
        setMessage("已撤销邀请");
        await loadData();
      } else {
        setError(json.error?.message ?? "撤销失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤销失败");
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
        setMessage("已移除成员");
        setConfirmRemove(null);
        await loadData();
      } else {
        setError(json.error?.message ?? "移除失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除失败");
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
        setMessage("已更新成员角色");
        await loadData();
      } else {
        setError(json.error?.message ?? "更新角色失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新角色失败");
    } finally {
      setChangingRoleUserId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Members</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">成员与权限</h1>
        </header>
        <div className="app-card p-8 text-center">
          <ShieldCheck size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            您没有权限查看此页面。请联系工作区管理员。
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">成员与权限</h1>
          <p className="mt-1 text-sm text-slate-500">
            管理工作区成员及其角色与访问权限
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
        >
          <RefreshCw size={16} />刷新
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
          <h2 className="text-sm font-bold text-slate-900">邀请新成员</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-600">邮箱地址</label>
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
            <label className="mb-1 block text-xs font-semibold text-slate-600">角色</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="member">成员</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="app-button-primary"
          >
            {inviting ? "发送中..." : "发送邀请"}
          </button>
        </form>
      </section>

      {/* Pending invitations */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">待处理邀请</h2>
            <span className="app-badge bg-amber-50 text-amber-700">{invitations.length}</span>
          </div>
        </div>
        {invitations.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">暂无待处理邀请</p>
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
                      角色：{ROLE_LABELS[inv.role]} · 状态：{inv.status} · 过期：{formatDate(inv.expiresAt)}
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
                      {revokingId === inv.id ? "撤销中..." : "撤销邀请"}
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
          <h2 className="text-sm font-bold text-slate-900">成员列表</h2>
          <span className="app-badge bg-slate-100 text-slate-600">{members.length}</span>
        </div>
        {members.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">暂无成员</p>
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
                      <p className="text-xs text-slate-500">加入于 {formatDate(m.joinedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <span className={`app-badge ${ROLE_BADGE_CLASS[m.role]}`}>
                        <ShieldCheck size={14} />{ROLE_LABELS[m.role]}
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.userId, e.target.value as "member" | "admin")}
                        disabled={changingRoleUserId === m.userId}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                      >
                        <option value="member">成员</option>
                        <option value="admin">管理员</option>
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
                        {removingUserId === m.userId ? "移除中..." : "移除"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={20} />
              </span>
              <h3 className="text-base font-bold text-slate-900">移除成员</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              确定要从组织中移除 <span className="font-semibold text-slate-800">{confirmRemove.displayName}</span> 吗？
              该成员将失去对所有工作区的访问权限。此操作不可撤销。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="app-button-secondary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleRemoveMember(confirmRemove.userId)}
                disabled={removingUserId === confirmRemove.userId}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                {removingUserId === confirmRemove.userId ? "移除中..." : "确认移除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
