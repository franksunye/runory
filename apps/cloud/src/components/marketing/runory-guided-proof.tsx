"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  MapPin,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { guidedSchedulingScenario } from "@/lib/guided-scheduling-scenario";

type GuidedStep = "brief" | "proposal" | "completed";
type ProcessingKind = "prepare" | "execute";

const COPY = {
  en: {
    badge: "Guided scenario",
    badgeDetail: "Real Runory data model · no live workspace writes",
    agentLabel: "External Agent example",
    prompt: "Schedule tomorrow’s urgent HVAC visit with the right technician.",
    start: "See Runory prepare the plan",
    stepBrief: "Business context",
    stepProposal: "Action card",
    stepCompleted: "Execution receipt",
    urgent: "Urgent",
    due: "SLA due",
    candidates: "Technician context",
    available: "Available",
    busy: "Busy",
    recommended: "Best match",
    outOfRegion: "Different region",
    skillMismatch: "Required skill not found",
    actorRole: "Dispatcher",
    actionTitle: "Runory Action Card",
    actionSubtitle: "A bounded plan prepared from current business state.",
    proposed: "Proposed assignment",
    reason: "Why this plan",
    reasons: ["HVAC skill matches", "Service region matches", "Completes before SLA"],
    conflict: "Conflict resolved",
    conflictBody: "10:00–12:00 overlaps an existing visit. Runory moved the proposal to 13:30–15:30.",
    commands: "Named commands",
    permission: "Permissions checked",
    noActions: "No customer notification · no production data changed",
    confirm: "Confirm guided execution",
    back: "Back to context",
    completedTitle: "Guided execution completed",
    completedBody: "The same assignment now appears in the operational schedule.",
    assigned: "Technician assigned",
    scheduled: "Visit scheduled",
    audit: "Guided audit reference",
    scheduleTitle: "Tomorrow’s schedule",
    after: "After",
    receipt: "Execution Receipt",
    reset: "Replay scenario",
    preparingTitle: "Runory is preparing a bounded plan",
    executingTitle: "Runory is applying the confirmed plan",
    preparingSteps: ["Reading work order context", "Checking skills, region, and availability", "Resolving schedule conflicts"],
    executingSteps: ["Validating actor permissions", "Applying assignment and schedule", "Writing the execution receipt"],
    guidedTiming: "Guided system transition",
    serviceRequired: "Service required",
    serviceRegion: "Service region",
    prepareHint: "Runory will evaluate the work order, every eligible technician, and the existing schedule.",
    truthful: "This guided proof mirrors current Runory entities, permissions, conflict behavior, and named Commands. It does not call an LLM or MCP server.",
  },
  zh: {
    badge: "引导式场景",
    badgeDetail: "真实 Runory 数据模型 · 不写入实时工作空间",
    agentLabel: "外部 Agent 示例",
    prompt: "为明天的紧急 HVAC 上门任务安排合适的技师。",
    start: "查看 Runory 如何准备方案",
    stepBrief: "业务上下文",
    stepProposal: "操作方案",
    stepCompleted: "执行凭证",
    urgent: "紧急",
    due: "SLA 截止",
    candidates: "技师上下文",
    available: "可用",
    busy: "忙碌",
    recommended: "最佳匹配",
    outOfRegion: "区域不匹配",
    skillMismatch: "缺少所需技能",
    actorRole: "Dispatcher",
    actionTitle: "Runory 操作方案",
    actionSubtitle: "基于当前业务状态生成的有限、可确认方案。",
    proposed: "建议分配",
    reason: "方案依据",
    reasons: ["具备 HVAC 技能", "服务区域匹配", "可在 SLA 前完成"],
    conflict: "已解决排期冲突",
    conflictBody: "10:00–12:00 与已有任务重叠。Runory 将建议时间调整为 13:30–15:30。",
    commands: "命名指令",
    permission: "权限已校验",
    noActions: "不发送客户通知 · 不修改生产数据",
    confirm: "确认引导执行",
    back: "返回业务上下文",
    completedTitle: "引导执行已完成",
    completedBody: "同一分配结果现在已经出现在运营排期中。",
    assigned: "已分配技师",
    scheduled: "已安排上门",
    audit: "引导审计编号",
    scheduleTitle: "明日排期",
    after: "执行后",
    receipt: "执行凭证",
    reset: "重新体验",
    preparingTitle: "Runory 正在准备受约束的方案",
    executingTitle: "Runory 正在应用已确认的方案",
    preparingSteps: ["读取工单业务上下文", "校验技能、区域和可用时间", "解决排期冲突"],
    executingSteps: ["校验操作者权限", "应用人员分配与排期", "写入执行凭证"],
    guidedTiming: "引导式系统过渡",
    serviceRequired: "所需服务",
    serviceRegion: "服务区域",
    prepareHint: "Runory 将评估工单、所有合适的技师以及当前排期。",
    truthful: "此引导体验与 Runory 当前实体、权限、冲突行为和命名指令保持一致，但不会调用 LLM 或 MCP Server。",
  },
} as const;

export function RunoryGuidedProof() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const scenario = guidedSchedulingScenario;
  const [step, setStep] = useState<GuidedStep>("brief");
  const [processing, setProcessing] = useState<ProcessingKind | null>(null);
  const [processingStage, setProcessingStage] = useState(0);
  const recommended = scenario.candidates.find((candidate) => candidate.match === "recommended")!;

  const stepIndex = processing === "prepare" ? 1 : processing === "execute" ? 2 : step === "brief" ? 0 : step === "proposal" ? 1 : 2;
  const stepLabels = [copy.stepBrief, copy.stepProposal, copy.stepCompleted];

  useEffect(() => {
    if (!processing) return;

    const stageTwo = window.setTimeout(() => setProcessingStage(1), 480);
    const stageThree = window.setTimeout(() => setProcessingStage(2), 980);
    const finish = window.setTimeout(() => {
      setStep(processing === "prepare" ? "proposal" : "completed");
      setProcessing(null);
      setProcessingStage(0);
    }, 1550);

    return () => {
      window.clearTimeout(stageTwo);
      window.clearTimeout(stageThree);
      window.clearTimeout(finish);
    };
  }, [processing]);

  const beginProcessing = (kind: ProcessingKind) => {
    setProcessingStage(0);
    setProcessing(kind);
  };

  const processingSteps = processing === "execute" ? copy.executingSteps : copy.preparingSteps;

  return (
    <div className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-[0_36px_100px_rgba(50,35,20,.14)]">
      <div className="border-b border-black/10 bg-[#fffdf8] px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-orange-800">
              <span className="size-1.5 rounded-full bg-orange-500" />
              {copy.badge}
            </span>
            <span className="hidden text-xs text-neutral-500 sm:inline">{copy.badgeDetail}</span>
          </div>
          <span className="text-xs font-semibold text-neutral-500">Runory FSM</span>
        </div>
      </div>

      <div className="grid bg-neutral-950 text-white lg:grid-cols-[280px_1fr]">
        <div className="border-white/10 px-5 py-5 lg:border-r lg:px-7">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
            <Bot size={15} className="text-orange-300" />
            {copy.agentLabel}
          </div>
        </div>
        <p className="border-t border-white/10 px-5 py-5 text-base leading-7 text-neutral-100 sm:px-7 sm:text-lg lg:border-t-0">“{copy.prompt}”</p>
      </div>

      <div className="grid grid-cols-3 border-b border-black/10 bg-white" aria-label="Guided scenario progress">
        {stepLabels.map((label, index) => (
          <div
            key={label}
            aria-current={index === stepIndex ? "step" : undefined}
            className={`flex items-center justify-center gap-2 border-r border-black/10 px-2 py-3.5 text-[10px] font-semibold last:border-r-0 sm:text-sm ${
              index <= stepIndex ? "text-neutral-900" : "text-neutral-400"
            }`}
          >
            <span className={`grid size-6 place-items-center rounded-full text-[11px] ${
              index < stepIndex
                ? "bg-emerald-100 text-emerald-700"
                : index === stepIndex
                  ? "bg-orange-100 text-orange-700"
                  : "bg-neutral-100 text-neutral-400"
            }`}>
              {index < stepIndex ? <Check size={12} /> : index + 1}
            </span>
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      <div className="p-5 sm:p-8 lg:p-12" aria-live="polite" aria-busy={processing !== null}>
        {processing && (
          <div className="grid min-h-[350px] place-items-center py-8">
            <div className="w-full max-w-3xl text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
                <LoaderCircle size={24} className="animate-spin motion-reduce:animate-none" />
              </span>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-orange-600">{copy.guidedTiming}</p>
              <h3 className="mt-2 text-xl font-semibold text-neutral-950 sm:text-2xl">
                {processing === "prepare" ? copy.preparingTitle : copy.executingTitle}
              </h3>
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
                {processingSteps.map((label, index) => (
                  <div key={label} className={`rounded-xl border p-4 transition-all duration-300 ${index <= processingStage ? "border-orange-200 bg-orange-50/70 text-neutral-900" : "border-black/10 bg-neutral-50 text-neutral-400"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${index < processingStage ? "bg-emerald-600 text-white" : index === processingStage ? "bg-orange-500 text-white" : "bg-neutral-200 text-neutral-500"}`}>
                        {index < processingStage ? <Check size={13} /> : index + 1}
                      </span>
                      <p className="text-xs font-semibold leading-5">{label}</p>
                    </div>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/5">
                      <div className={`h-full bg-orange-500 transition-all duration-500 ${index < processingStage ? "w-full" : index === processingStage ? "w-2/3 animate-pulse motion-reduce:animate-none" : "w-0"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!processing && step === "brief" && (
          <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-12">
            <div className="flex min-h-[320px] flex-col rounded-[24px] border border-orange-200 bg-orange-50/70 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-red-700">{copy.urgent}</span>
                    <span className="font-mono text-[10px] text-neutral-400">{scenario.workOrder.id}</span>
                  </div>
                  <h3 className="mt-5 max-w-sm text-2xl font-semibold leading-tight text-neutral-950 sm:text-3xl">{scenario.workOrder.title}</h3>
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-600"><MapPin size={15} />{scenario.workOrder.site}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] uppercase tracking-[.12em] text-neutral-400">{copy.due}</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-700">{scenario.workOrder.slaDue}</p>
                </div>
              </div>
              <div className="mt-auto grid gap-3 pt-10 sm:grid-cols-2">
                <div className="rounded-xl border border-orange-200/70 bg-white/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-neutral-400">{copy.serviceRequired}</p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">{scenario.workOrder.requiredSkill}</p>
                </div>
                <div className="rounded-xl border border-orange-200/70 bg-white/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-neutral-400">{copy.serviceRegion}</p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">{scenario.workOrder.region}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-[.14em] text-neutral-500">{copy.candidates}</p>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><Wrench size={14} />HVAC</span>
              </div>
              <div className="grid gap-2">
                {scenario.candidates.map((candidate) => (
                  <div key={candidate.id} className="flex min-h-[82px] items-center gap-4 rounded-2xl border border-black/10 px-4 py-3 sm:px-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">{candidate.initials}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-semibold text-neutral-900">{candidate.name}</p>
                        <span className={`size-1.5 shrink-0 rounded-full ${candidate.availability === "available" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-500 sm:text-sm">
                        {candidate.availability === "available" ? copy.available : copy.busy} · {candidate.region} · {candidate.skills.join(", ")}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                      candidate.match === "recommended"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}>
                      {candidate.match === "recommended"
                        ? copy.recommended
                        : candidate.match === "out_of_region"
                          ? copy.outOfRegion
                          : copy.skillMismatch}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="max-w-xl text-sm leading-6 text-neutral-500">{copy.prepareHint}</p>
              <button
                type="button"
                onClick={() => beginProcessing("prepare")}
                className="flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-neutral-950 px-8 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
              >
                {copy.start}<ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {!processing && step === "proposal" && (
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:col-span-12">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.16em] text-orange-600">{copy.actionTitle}</p>
                <p className="mt-2 text-base leading-6 text-neutral-500">{copy.actionSubtitle}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"><ShieldCheck size={14} />{scenario.actor.name} · {copy.actorRole}</span>
            </div>

            <div className="flex min-h-[330px] flex-col rounded-[24px] bg-neutral-950 p-6 text-white sm:p-8 lg:col-span-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-neutral-500">{copy.proposed}</p>
              <div className="mt-8 flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-full bg-orange-300 text-sm font-bold text-neutral-950">{recommended.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-semibold">{recommended.name}</p>
                  <p className="mt-1 text-sm text-neutral-400">{scenario.workOrder.requiredSkill} · {scenario.workOrder.region}</p>
                </div>
              </div>
              <div className="mt-8 rounded-2xl bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[.14em] text-neutral-500">{copy.scheduled}</p>
                <p className="mt-2 text-xl font-semibold text-white">{scenario.resolvedSlot.start}–{scenario.resolvedSlot.end}</p>
                <p className="mt-1 text-sm text-neutral-400">{scenario.workOrder.site}</p>
              </div>
              <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-3">
                {copy.reasons.map((reason) => (
                  <p key={reason} className="flex items-center gap-2 text-xs leading-5 text-neutral-300">
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />{reason}
                  </p>
                ))}
              </div>
            </div>

            <div className="grid content-start gap-5 lg:col-span-7">
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-6 sm:p-7">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-amber-800"><AlertTriangle size={15} />{copy.conflict}</p>
                <p className="mt-4 max-w-2xl text-base leading-7 text-amber-950">{copy.conflictBody}</p>
                <div className="mt-5 flex items-center gap-3 text-sm font-semibold text-amber-900">
                  <span className="line-through opacity-50">{scenario.originalSlot.start}–{scenario.originalSlot.end}</span>
                  <ArrowRight size={16} />
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{scenario.resolvedSlot.start}–{scenario.resolvedSlot.end}</span>
                </div>
              </div>

              <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-6 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-neutral-400">{copy.commands}</p>
                    <p className="mt-3 font-mono text-sm text-neutral-700">{scenario.commands.join(" · ")}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck size={14} />{copy.permission}</span>
                </div>
                <p className="mt-5 border-t border-black/5 pt-4 text-xs text-neutral-500">{copy.noActions}</p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
              <button type="button" onClick={() => setStep("brief")} className="min-h-12 rounded-full px-6 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-neutral-200">{copy.back}</button>
              <button type="button" onClick={() => beginProcessing("execute")} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-orange-500 px-9 text-sm font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"><Check size={17} />{copy.confirm}</button>
            </div>
          </div>
        )}

        {!processing && step === "completed" && (
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="rounded-[24px] bg-emerald-50 p-6 sm:p-7 lg:col-span-12">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check size={22} /></span>
                <div>
                  <p className="text-xl font-semibold text-emerald-950">{copy.completedTitle}</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-800">{copy.completedBody}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/10 p-6 sm:p-8 lg:col-span-7">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[.14em] text-neutral-500"><CalendarDays size={16} />{copy.scheduleTitle}</p>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{copy.after}</span>
              </div>
              <div className="mt-6 grid grid-cols-[64px_1fr] gap-4">
                <div className="flex flex-col justify-between py-2 text-xs text-neutral-400"><span>10:00</span><span>12:00</span><span>13:30</span><span>15:30</span></div>
                <div className="space-y-3 border-l border-neutral-200 pl-5">
                  <div className="rounded-xl bg-neutral-100 px-4 py-3">
                    <p className="text-sm font-semibold text-neutral-700">{recommended.existingVisit?.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">10:00–12:00</p>
                  </div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-orange-950">{scenario.workOrder.title}</p>
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-xs text-orange-800">13:30–15:30 · {recommended.name}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-[24px] bg-neutral-950 p-6 text-white sm:p-8 lg:col-span-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-[.16em] text-orange-300">{copy.receipt}</p>
                <span className="font-mono text-xs text-neutral-500">{scenario.receipt.id}</span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/5 p-4"><p className="text-neutral-500">{copy.assigned}</p><p className="mt-2 font-semibold text-neutral-100">{recommended.name}</p></div>
                <div className="rounded-xl bg-white/5 p-4"><p className="text-neutral-500">{copy.scheduled}</p><p className="mt-2 font-semibold text-neutral-100">13:30–15:30</p></div>
              </div>
              <p className="mt-auto flex items-center gap-2 pt-8 font-mono text-xs text-neutral-400"><ShieldCheck size={14} />{copy.audit}: {scenario.receipt.auditId}</p>
            </div>

            <button type="button" onClick={() => setStep("brief")} className="mx-auto flex min-h-12 items-center justify-center gap-2 rounded-full border border-black/10 px-7 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-neutral-200 lg:col-span-12"><RotateCcw size={15} />{copy.reset}</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-black/10 bg-neutral-50 px-4 py-3 text-[10px] leading-4 text-neutral-500 sm:px-5">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-neutral-400" />
        <p>{copy.truthful}</p>
      </div>
    </div>
  );
}
