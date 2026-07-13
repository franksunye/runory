"use client";

import { Shield, Users } from "lucide-react";
import type { AccessDirectory } from "./access-types";

interface RoleCatalogPanelProps {
  directory: AccessDirectory;
  locale: string;
}

const PACK_LABELS: Record<string, { en: string; zh: string }> = {
  "crm-lite-pack": { en: "Customer relationship management", zh: "客户关系管理" },
  "fsm-pack": { en: "Field service management", zh: "现场服务管理" },
  "sales-quote-pack": { en: "Sales & quotes", zh: "销售与报价" },
};

const SUBJECT_LABELS: Record<string, { en: string; zh: string }> = {
  company: { en: "Companies", zh: "客户公司" },
  contact: { en: "Contacts", zh: "联系人" },
  deal: { en: "Deals", zh: "商机" },
  task: { en: "Service tasks", zh: "服务任务" },
  work_order: { en: "Work orders", zh: "工单" },
  visit: { en: "Visits", zh: "现场服务" },
  form: { en: "Forms", zh: "服务表单" },
  assignment: { en: "Assignments", zh: "人员分派" },
  schedule: { en: "Schedules", zh: "排程" },
  quote: { en: "Quotes", zh: "报价" },
  workflow: { en: "Approvals", zh: "审批" },
};

const ACTION_LABELS: Record<string, { en: string; zh: string }> = {
  read: { en: "view", zh: "查看" },
  create: { en: "create", zh: "创建" },
  update: { en: "edit", zh: "编辑" },
  delete: { en: "delete", zh: "删除" },
  manage: { en: "manage", zh: "管理" },
  triage: { en: "triage", zh: "分诊" },
  start: { en: "start", zh: "开始" },
  complete: { en: "complete", zh: "完成" },
  reopen: { en: "reopen", zh: "重新打开" },
  execute: { en: "execute", zh: "执行" },
  submit: { en: "submit", zh: "提交" },
  review: { en: "review", zh: "审核" },
  approve: { en: "approve", zh: "批准" },
  reject: { en: "reject", zh: "拒绝" },
  edit_draft: { en: "edit drafts", zh: "编辑草稿" },
  decide: { en: "make decisions", zh: "作出决策" },
  override: { en: "override conflicts", zh: "覆盖冲突" },
};

function permissionLabel(permission: string, zh: boolean): string {
  if (permission === "*") return zh ? "全部业务能力" : "All business capabilities";
  const parts = permission.split(".");
  const subject = SUBJECT_LABELS[parts[0]]?.[zh ? "zh" : "en"] ?? parts[0].replaceAll("_", " ");
  const actionKey = parts.at(-1) ?? "";
  const action = ACTION_LABELS[actionKey]?.[zh ? "zh" : "en"] ?? actionKey.replaceAll("_", " ");
  return zh ? `${subject}：${action}` : `${subject}: ${action}`;
}

export default function RoleCatalogPanel({ directory, locale }: RoleCatalogPanelProps) {
  const zh = locale === "zh";

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-950">{zh ? "业务角色目录" : "Business role catalog"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {zh ? "人员绑定稳定的业务角色；已安装 Pack 自动为角色贡献能力，卸载 Pack 不会破坏人员角色。" : "People keep stable business roles while installed Packs contribute capabilities without coupling access to Pack lifecycle."}
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {directory.roles.map((role) => {
              const assignees = directory.members.filter((member) => role.assignedUserIds?.includes(member.userId));
              const contributingPacks = role.packIds ?? [role.packId];
              return (
                <article key={role.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Shield size={17} /></span>
                      <div><h3 className="text-sm font-bold text-slate-900">{role.label}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{role.description ?? role.groupKey}</p></div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"><Users size={12} />{assignees.length}</span>
                  </div>
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{zh ? "能力来源" : "Capability sources"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {contributingPacks.map((packId) => <span key={packId} className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{PACK_LABELS[packId]?.[zh ? "zh" : "en"] ?? packId.replaceAll("-", " ")}</span>)}
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{zh ? "主要能力" : "Capabilities"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role.permissions.slice(0, 6).map((permission) => <span key={permission} className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{permissionLabel(permission, zh)}</span>)}
                      {role.permissions.length > 6 && <span className="px-2 py-1 text-xs text-slate-400">+{role.permissions.length - 6}</span>}
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{zh ? "已分配人员" : "Assigned people"}</p>
                    <p className="mt-1 text-xs text-slate-600">{assignees.length > 0 ? assignees.map((member) => member.displayName).join(", ") : (zh ? "尚未分配" : "Not assigned")}</p>
                  </div>
                </article>
              );
            })}
          </div>
      </section>
    </section>
  );
}
