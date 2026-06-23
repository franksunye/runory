"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Loader2,
  Package,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DiffPreview from "./DiffPreview";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

type FieldType = "text" | "number" | "date" | "select" | "boolean";
type Step = 1 | 2 | 3 | 4 | 5;

interface ObjectInfo {
  objectKey: string;
  label: string;
}

const OBJECT_ICONS: Record<string, LucideIcon> = {
  customer: Users,
  contact: User,
  task: CheckSquare,
};

const OBJECT_LABELS: Record<string, string> = {
  customer: "客户",
  contact: "联系人",
  task: "任务",
};

const TYPE_LABELS: Record<string, string> = {
  text: "文本",
  number: "数字",
  date: "日期",
  select: "下拉选择",
  boolean: "是/否",
};

const BUSINESS_PAGE: Record<string, string> = {
  customer: "/customers",
  contact: "/contacts",
  task: "/tasks",
};

const FIELD_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const STEP_LABELS = ["选择对象", "字段信息", "显示设置", "预览确认", "应用中"];

function objectLabel(key: string): string {
  return OBJECT_LABELS[key] ?? key;
}

export default function AddFieldWizard() {
  const workspaceId = useParams().workspaceId as string;

  const [step, setStep] = useState<Step>(1);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(true);

  const [targetObject, setTargetObject] = useState("");
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldKeyTouched, setFieldKeyTouched] = useState(false);
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [showInList, setShowInList] = useState(true);
  const [showInForm, setShowInForm] = useState(true);
  const [formSections, setFormSections] = useState<string[]>([]);
  const [formSection, setFormSection] = useState<string>("__default__");
  const [newSectionName, setNewSectionName] = useState("");

  const [plan, setPlan] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedVersion, setAppliedVersion] = useState<number | null>(null);

  const loadObjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/objects`);
      const json = await res.json();
      if (json.success) setObjects(json.data);
    } catch {
      /* ignore */
    } finally {
      setLoadingObjects(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadObjects();
  }, [loadObjects]);

  const loadFormSections = useCallback(async (objectKey: string) => {
    setFormSections([]);
    setFormSection("__default__");
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/views`
      );
      const json = await res.json();
      if (json.success) {
        const formView = json.data.find((v: any) => v.viewKey === `${objectKey}_form`);
        const sections: Array<{ title: string }> = formView?.config?.sections ?? [];
        setFormSections(sections.map((s) => s.title));
      }
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  const handleSelectObject = (objectKey: string) => {
    setTargetObject(objectKey);
    void loadFormSections(objectKey);
  };

  const options = useMemo(
    () =>
      optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [optionsText]
  );

  const fieldKeyError = useMemo(() => {
    if (!fieldKey) return "请填写字段标识";
    if (!FIELD_KEY_REGEX.test(fieldKey)) {
      return "只能包含字母、数字和下划线，且以字母或下划线开头";
    }
    return null;
  }, [fieldKey]);

  const labelError = useMemo(() => {
    if (!label.trim()) return "请填写字段标签";
    return null;
  }, [label]);

  const optionsError = useMemo(() => {
    if (type === "select" && options.length < 2) {
      return "下拉选择至少需要 2 个选项，用逗号分隔";
    }
    return null;
  }, [type, options]);

  const newSectionError = useMemo(() => {
    if (showInForm && formSection === "__new__" && !newSectionName.trim()) {
      return "请输入新分区名称";
    }
    return null;
  }, [showInForm, formSection, newSectionName]);

  const canProceedStep2 = !labelError && !fieldKeyError && !optionsError;
  const canProceedStep3 = !newSectionError;

  const buildPlan = useCallback((): any => {
    const sectionNote =
      showInForm && formSection === "__new__" && newSectionName.trim()
        ? `（新分区：${newSectionName.trim()}）`
        : showInForm && formSection !== "__default__"
          ? `（分区：${formSection}）`
          : "";

    return {
      name: `${label.trim()}扩展`,
      description: `为${objectLabel(targetObject)}对象添加${label.trim()}字段${sectionNote}`,
      targetModules: [`runory.${targetObject}`],
      riskLevel: "low",
      customFields: [
        {
          targetObject,
          fieldKey: fieldKey.trim(),
          label: label.trim(),
          type,
          ownership: "workspace_extension",
          required,
          ...(type === "select" ? { validation: { options } } : {}),
          ui: {
            listColumn: showInList,
            ...(showInForm ? { slot: `${targetObject}.form.basic_fields.after` } : {}),
            order: 100,
          },
        },
      ],
    };
  }, [label, targetObject, fieldKey, type, required, options, showInList, showInForm, formSection, newSectionName]);

  const preparePreview = useCallback(async () => {
    setPreparing(true);
    setPrepareError(null);
    setValidation(null);
    setDiff(null);
    const builtPlan = buildPlan();
    setPlan(builtPlan);
    try {
      const planRes = await fetch(`/api/workspaces/${workspaceId}/agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(builtPlan),
      });
      const planJson = await planRes.json();
      if (!planJson.success) {
        setPrepareError(planJson.error?.message ?? "校验失败");
        return;
      }
      setValidation(planJson.data);
      if (!planJson.data.valid) {
        setPrepareError(`校验失败：${planJson.data.errors.join("; ")}`);
        return;
      }

      const previewRes = await fetch(`/api/workspaces/${workspaceId}/agent/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(builtPlan),
      });
      const previewJson = await previewRes.json();
      if (!previewJson.success) {
        setPrepareError(previewJson.error?.message ?? "预览失败");
        return;
      }
      setDiff(previewJson.data);
    } catch (e) {
      setPrepareError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setPreparing(false);
    }
  }, [buildPlan, workspaceId]);

  useEffect(() => {
    if (step === 4 && !diff && !preparing && !prepareError) {
      void preparePreview();
    }
  }, [step, diff, preparing, prepareError, preparePreview]);

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ plan, createdBy: "ui-user" }),
      });
      const json = await res.json();
      if (json.success) {
        setAppliedVersion(json.data.version);
        notifyWorkspaceDataChanged();
      } else {
        setApplyError(json.error?.message ?? "应用失败");
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setTargetObject("");
    setLabel("");
    setFieldKey("");
    setFieldKeyTouched(false);
    setType("text");
    setOptionsText("");
    setRequired(false);
    setShowInList(true);
    setShowInForm(true);
    setFormSection("__default__");
    setNewSectionName("");
    setPlan(null);
    setDiff(null);
    setValidation(null);
    setPrepareError(null);
    setApplyError(null);
    setAppliedVersion(null);
    setApplying(false);
    setPreparing(false);
  };

  const goToStep = (next: Step) => {
    setStep(next);
  };

  // ── Render ──

  if (loadingObjects) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  if (objects.length === 0) {
    return (
      <div className="app-card flex flex-col items-center p-10 text-center">
        <Package size={32} className="text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">暂无可定制对象</p>
        <p className="mt-1 text-xs text-slate-400">
          请先安装业务包（如 CRM Lite Pack）以创建对象和字段
        </p>
        <Link
          href={`/w/${workspaceId}/modules`}
          className="app-button-primary mt-4"
        >
          前往模块中心
        </Link>
      </div>
    );
  }

  // Step 5: Applying / Result
  if (step === 5) {
    if (applying) {
      return (
        <div className="app-card flex flex-col items-center p-12 text-center">
          <Loader2 size={40} className="animate-spin text-indigo-600" />
          <p className="mt-4 text-sm font-medium text-slate-700">正在应用扩展...</p>
          <p className="mt-1 text-xs text-slate-400">请稍候，正在更新工作区配置</p>
        </div>
      );
    }

    if (applyError) {
      return (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <AlertCircle size={40} className="text-red-500" />
          <p className="mt-4 text-sm font-medium text-slate-700">应用失败</p>
          <p className="mt-1 max-w-md text-xs text-red-600">{applyError}</p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setApplyError(null);
                setStep(4);
              }}
              className="app-button-secondary"
            >
              <ArrowLeft size={16} />
              返回上一步
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              className="app-button-primary"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    if (appliedVersion !== null) {
      const businessPath = BUSINESS_PAGE[targetObject];
      return (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <CheckCircle2 size={40} className="text-green-600" />
          <p className="mt-4 text-base font-bold text-slate-950">扩展已成功应用</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            已为{objectLabel(targetObject)}对象添加字段「{label}」（版本 #{appliedVersion}）。
            你现在可以前往业务页面查看和使用新字段。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {businessPath && (
              <Link
                href={`/w/${workspaceId}${businessPath}`}
                className="app-button-primary"
              >
                查看{objectLabel(targetObject)}列表
              </Link>
            )}
            <Link
              href={`/w/${workspaceId}/audit`}
              className="app-button-secondary"
            >
              查看审计日志
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="app-button-secondary"
            >
              再添加一个字段
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as Step;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <div key={i} className="flex items-center">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : isDone
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full text-[10px] ${
                    isActive
                      ? "bg-white/20"
                      : isDone
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-300 text-white"
                  }`}
                >
                  {isDone ? "✓" : stepNum}
                </span>
                {label}
              </div>
              {i < STEP_LABELS.length - 1 && (
                <ChevronRight size={14} className="mx-0.5 shrink-0 text-slate-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Choose Object */}
      {step === 1 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">选择对象</h2>
          <p className="mt-1 text-sm text-slate-500">选择要添加字段的目标对象</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {objects.map((obj) => {
              const Icon = OBJECT_ICONS[obj.objectKey] ?? Box;
              const selected = targetObject === obj.objectKey;
              return (
                <button
                  key={obj.objectKey}
                  type="button"
                  onClick={() => handleSelectObject(obj.objectKey)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`grid size-10 place-items-center rounded-lg ${
                      selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{obj.label}</p>
                    <p className="text-xs text-slate-400">{obj.objectKey}</p>
                  </div>
                  {selected && (
                    <CheckCircle2 size={18} className="ml-auto text-indigo-600" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => goToStep(2)}
              disabled={!targetObject}
              className="app-button-primary disabled:opacity-50"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Field Details */}
      {step === 2 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">字段信息</h2>
          <p className="mt-1 text-sm text-slate-500">
            为{objectLabel(targetObject)}对象配置新字段的详细信息
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                字段标签 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：客户等级"
                className="app-input mt-1.5"
              />
              {labelError && (
                <p className="mt-1 text-xs text-red-600">{labelError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                字段标识 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                onBlur={() => setFieldKeyTouched(true)}
                placeholder="例如：customer_tier"
                className="app-input mt-1.5 font-mono"
              />
              <p className="mt-1 text-xs text-slate-400">
                用于程序化访问，只能包含字母、数字和下划线，且以字母或下划线开头
              </p>
              {fieldKeyTouched && fieldKeyError && (
                <p className="mt-1 text-xs text-red-600">{fieldKeyError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                字段类型 <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="app-input mt-1.5"
              >
                <option value="text">文本</option>
                <option value="number">数字</option>
                <option value="date">日期</option>
                <option value="select">下拉选择</option>
                <option value="boolean">是/否</option>
              </select>
            </div>

            {type === "select" && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  选项 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="例如：普通客户, VIP客户, 战略客户"
                  className="app-input mt-1.5"
                />
                <p className="mt-1 text-xs text-slate-400">
                  用英文逗号分隔，至少 2 个选项
                </p>
                {optionsError && (
                  <p className="mt-1 text-xs text-red-600">{optionsError}</p>
                )}
                {options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.map((opt, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">是否必填</p>
                <p className="text-xs text-slate-400">用户创建记录时必须填写此字段</p>
              </div>
              <button
                type="button"
                onClick={() => setRequired(!required)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  required ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition ${
                    required ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="app-button-secondary"
            >
              <ArrowLeft size={16} />
              上一步
            </button>
            <button
              type="button"
              onClick={() => goToStep(3)}
              disabled={!canProceedStep2}
              className="app-button-primary disabled:opacity-50"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Visibility */}
      {step === 3 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">显示设置</h2>
          <p className="mt-1 text-sm text-slate-500">
            配置字段在视图中的显示方式
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">显示在列表视图</p>
                <p className="text-xs text-slate-400">在{objectLabel(targetObject)}列表中作为一列显示</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInList(!showInList)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  showInList ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition ${
                    showInList ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">显示在表单视图</p>
                <p className="text-xs text-slate-400">在{objectLabel(targetObject)}表单中可编辑此字段</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInForm(!showInForm)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  showInForm ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition ${
                    showInForm ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {showInForm && (
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <label className="block text-sm font-medium text-slate-700">
                  所属分区
                </label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="app-input mt-1.5"
                >
                  <option value="__default__">默认分区（第一个分区）</option>
                  {formSections.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                  <option value="__new__">新建分区…</option>
                </select>
                {formSection === "__new__" && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="输入新分区名称"
                      className="app-input"
                    />
                    {newSectionError && (
                      <p className="mt-1 text-xs text-red-600">{newSectionError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="app-button-secondary"
            >
              <ArrowLeft size={16} />
              上一步
            </button>
            <button
              type="button"
              onClick={() => goToStep(4)}
              disabled={!canProceedStep3}
              className="app-button-primary disabled:opacity-50"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Preview & Confirm */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="app-card p-6">
            <h2 className="text-base font-bold text-slate-950">预览确认</h2>
            <p className="mt-1 text-sm text-slate-500">
              请确认以下变更信息，确认后将正式应用到工作区
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">目标对象</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {objectLabel(targetObject)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">字段标签</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{label}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">字段标识</p>
                <p className="mt-0.5 text-sm font-mono font-semibold text-slate-800">{fieldKey}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">字段类型</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {TYPE_LABELS[type] ?? type}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">是否必填</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {required ? "是" : "否"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">显示位置</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {showInList && showInForm
                    ? "列表 + 表单"
                    : showInList
                      ? "仅列表"
                      : showInForm
                        ? "仅表单"
                        : "不显示"}
                </p>
              </div>
              {type === "select" && options.length > 0 && (
                <div className="rounded-lg bg-slate-50 px-4 py-3 sm:col-span-2">
                  <p className="text-xs text-slate-500">下拉选项</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {options.map((opt, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 shadow-sm"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {preparing && (
            <div className="app-card flex items-center gap-3 p-5">
              <Loader2 size={20} className="animate-spin text-indigo-600" />
              <p className="text-sm text-slate-600">正在生成预览...</p>
            </div>
          )}

          {prepareError && (
            <div className="app-error">
              <p className="font-medium">预览生成失败</p>
              <p className="mt-1 text-xs">{prepareError}</p>
              <button
                type="button"
                onClick={() => {
                  setPrepareError(null);
                  void preparePreview();
                }}
                className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                重新生成
              </button>
            </div>
          )}

          {diff && !preparing && !prepareError && (
            <>
              <DiffPreview diff={diff} />
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                这是正式变更前的审批点。点击「确认应用」后，工作区配置和审计日志将发生正式变化。
              </div>
            </>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => goToStep(3)}
              disabled={preparing || applying}
              className="app-button-secondary"
            >
              <ArrowLeft size={16} />
              上一步
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(5);
                void handleApply();
              }}
              disabled={!diff || preparing || applying}
              className="app-button-primary disabled:opacity-50"
            >
              确认应用
              <CheckCircle2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
