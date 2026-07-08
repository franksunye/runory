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
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiPost } from "@/lib/api-fetch";

type FieldType = "text" | "number" | "date" | "select" | "boolean";
type Step = 1 | 2 | 3 | 4 | 5;
type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

interface ObjectInfo {
  objectKey: string;
  label: string;
}

const OBJECT_ICONS: Record<string, LucideIcon> = {
  customer: Users,
  contact: User,
  task: CheckSquare,
};

const BUSINESS_PAGE: Record<string, string> = {
  customer: "/customers",
  contact: "/contacts",
  task: "/tasks",
};

const FIELD_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function objectLabel(key: string, t: TFunc): string {
  if (key === "customer") return t("diff.object.customer");
  if (key === "contact") return t("diff.object.contact");
  if (key === "task") return t("diff.object.task");
  return key;
}

function typeLabel(key: FieldType, t: TFunc): string {
  switch (key) {
    case "text":
      return t("extension.type.text");
    case "number":
      return t("extension.type.number");
    case "date":
      return t("extension.type.date");
    case "select":
      return t("extension.type.select");
    case "boolean":
      return t("extension.type.boolean");
    default:
      return key;
  }
}

function stepLabels(t: TFunc): string[] {
  return [
    t("addField.step.selectObject"),
    t("addField.step.fieldInfo"),
    t("addField.step.displaySettings"),
    t("addField.step.previewConfirm"),
    t("addField.step.applying"),
  ];
}

export default function AddFieldWizard() {
  const { t } = useI18n();
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
      const json = await apiFetch<{ success: boolean; data: ObjectInfo[] }>(
        `/api/workspaces/${workspaceId}/objects`
      );
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
      const json = await apiFetch<{ success: boolean; data: Array<{ viewKey: string; config?: { sections?: Array<{ title: string }> } }> }>(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/views`
      );
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
    if (!fieldKey) return t("addField.fieldKeyRequired");
    if (!FIELD_KEY_REGEX.test(fieldKey)) {
      return t("addField.fieldKeyPattern");
    }
    return null;
  }, [fieldKey, t]);

  const labelError = useMemo(() => {
    if (!label.trim()) return t("addField.labelRequired");
    return null;
  }, [label, t]);

  const optionsError = useMemo(() => {
    if (type === "select" && options.length < 2) {
      return t("addField.optionsMinTwo");
    }
    return null;
  }, [type, options, t]);

  const newSectionError = useMemo(() => {
    if (showInForm && formSection === "__new__" && !newSectionName.trim()) {
      return t("addField.newSectionRequired");
    }
    return null;
  }, [showInForm, formSection, newSectionName, t]);

  const canProceedStep2 = !labelError && !fieldKeyError && !optionsError;
  const canProceedStep3 = !newSectionError;

  const buildPlan = useCallback((): any => {
    const sectionNote =
      showInForm && formSection === "__new__" && newSectionName.trim()
        ? t("addField.planNoteNewSection", { name: newSectionName.trim() })
        : showInForm && formSection !== "__default__"
          ? t("addField.planNoteSection", { name: formSection })
          : "";

    return {
      name: t("addField.planName", { label: label.trim() }),
      description: t("addField.planDescription", {
        object: objectLabel(targetObject, t),
        field: label.trim(),
        note: sectionNote,
      }),
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
  }, [label, targetObject, fieldKey, type, required, options, showInList, showInForm, formSection, newSectionName, t]);

  const preparePreview = useCallback(async () => {
    setPreparing(true);
    setPrepareError(null);
    setValidation(null);
    setDiff(null);
    const builtPlan = buildPlan();
    setPlan(builtPlan);
    try {
      const planJson = await apiPost<{ success: boolean; error?: { message: string }; data: { valid: boolean; errors: string[] } }>(
        `/api/workspaces/${workspaceId}/agent/plan`,
        builtPlan
      );
      if (!planJson.success) {
        setPrepareError(planJson.error?.message ?? t("addField.validationFailedShort"));
        return;
      }
      setValidation(planJson.data);
      if (!planJson.data.valid) {
        setPrepareError(t("addField.validationFailed", { errors: planJson.data.errors.join("; ") }));
        return;
      }

      const previewJson = await apiPost<{ success: boolean; error?: { message: string }; data: unknown }>(
        `/api/workspaces/${workspaceId}/agent/preview`,
        builtPlan
      );
      if (!previewJson.success) {
        setPrepareError(previewJson.error?.message ?? t("addField.previewFailed"));
        return;
      }
      setDiff(previewJson.data);
    } catch (e) {
      setPrepareError(e instanceof Error ? e.message : t("extension.requestFailed"));
    } finally {
      setPreparing(false);
    }
  }, [buildPlan, workspaceId, t]);

  useEffect(() => {
    if (step === 4 && !diff && !preparing && !prepareError) {
      void preparePreview();
    }
  }, [step, diff, preparing, prepareError, preparePreview]);

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string }; data: { version: number } }>(
        `/api/workspaces/${workspaceId}/agent/apply`,
        { plan, createdBy: "ui-user" }
      );
      if (json.success) {
        setAppliedVersion(json.data.version);
        notifyWorkspaceDataChanged();
      } else {
        setApplyError(json.error?.message ?? t("addField.applyFailed"));
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : t("extension.requestFailed"));
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
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  if (objects.length === 0) {
    return (
      <div className="app-card flex flex-col items-center p-10 text-center">
        <Package size={32} className="text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">{t("addField.noObjects")}</p>
        <p className="mt-1 text-xs text-slate-400">
          {t("addField.noObjectsHint")}
        </p>
        <Link
          href={`/w/${workspaceId}/modules`}
          className="app-button-primary mt-4"
        >
          {t("addField.goModules")}
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
          <p className="mt-4 text-sm font-medium text-slate-700">{t("addField.applyingTitle")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("addField.applyingHint")}</p>
        </div>
      );
    }

    if (applyError) {
      return (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <AlertCircle size={40} className="text-red-500" />
          <p className="mt-4 text-sm font-medium text-slate-700">{t("addField.applyFailed")}</p>
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
              {t("addField.backToPrevStep")}
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              className="app-button-primary"
            >
              {t("workspace.retry")}
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
          <p className="mt-4 text-base font-bold text-slate-950">{t("addField.appliedSuccess")}</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            {t("addField.appliedSuccessBody", {
              object: objectLabel(targetObject, t),
              label,
              version: appliedVersion,
            })}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {businessPath && (
              <Link
                href={`/w/${workspaceId}${businessPath}`}
                className="app-button-primary"
              >
                {t("addField.viewObjectList", { object: objectLabel(targetObject, t) })}
              </Link>
            )}
            <Link
              href={`/w/${workspaceId}/audit`}
              className="app-button-secondary"
            >
              {t("addField.viewAuditLog")}
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="app-button-secondary"
            >
              {t("addField.addAnother")}
            </button>
          </div>
        </div>
      );
    }
  }

  const steps = stepLabels(t);

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((stepLabel, i) => {
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
                {stepLabel}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight size={14} className="mx-0.5 shrink-0 text-slate-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Choose Object */}
      {step === 1 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">{t("addField.selectObjectTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("addField.selectObjectHint")}</p>
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
              {t("addField.next")}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Field Details */}
      {step === 2 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">{t("addField.fieldInfoTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("addField.fieldInfoHint", { object: objectLabel(targetObject, t) })}
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("addField.fieldLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("addField.fieldLabelPlaceholder")}
                className="app-input mt-1.5"
              />
              {labelError && (
                <p className="mt-1 text-xs text-red-600">{labelError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("addField.fieldKey")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                onBlur={() => setFieldKeyTouched(true)}
                placeholder="customer_tier"
                className="app-input mt-1.5 font-mono"
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("addField.fieldKeyHint")}
              </p>
              {fieldKeyTouched && fieldKeyError && (
                <p className="mt-1 text-xs text-red-600">{fieldKeyError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("addField.fieldType")} <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="app-input mt-1.5"
              >
                <option value="text">{t("extension.type.text")}</option>
                <option value="number">{t("extension.type.number")}</option>
                <option value="date">{t("extension.type.date")}</option>
                <option value="select">{t("extension.type.select")}</option>
                <option value="boolean">{t("extension.type.boolean")}</option>
              </select>
            </div>

            {type === "select" && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t("addField.options")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder={t("addField.optionsPlaceholder")}
                  className="app-input mt-1.5"
                />
                <p className="mt-1 text-xs text-slate-400">
                  {t("addField.optionsHint")}
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
                <p className="text-sm font-medium text-slate-700">{t("addField.required")}</p>
                <p className="text-xs text-slate-400">{t("addField.requiredHint")}</p>
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
              {t("addField.prev")}
            </button>
            <button
              type="button"
              onClick={() => goToStep(3)}
              disabled={!canProceedStep2}
              className="app-button-primary disabled:opacity-50"
            >
              {t("addField.next")}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Visibility */}
      {step === 3 && (
        <div className="app-card p-6">
          <h2 className="text-base font-bold text-slate-950">{t("addField.displaySettingsTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("addField.displaySettingsHint")}
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">{t("addField.showInList")}</p>
                <p className="text-xs text-slate-400">{t("addField.showInListHint", { object: objectLabel(targetObject, t) })}</p>
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
                <p className="text-sm font-medium text-slate-700">{t("addField.showInForm")}</p>
                <p className="text-xs text-slate-400">{t("addField.showInFormHint", { object: objectLabel(targetObject, t) })}</p>
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
                  {t("addField.formSection")}
                </label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="app-input mt-1.5"
                >
                  <option value="__default__">{t("addField.defaultSection")}</option>
                  {formSections.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                  <option value="__new__">{t("addField.newSection")}</option>
                </select>
                {formSection === "__new__" && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder={t("addField.newSectionPlaceholder")}
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
              {t("addField.prev")}
            </button>
            <button
              type="button"
              onClick={() => goToStep(4)}
              disabled={!canProceedStep3}
              className="app-button-primary disabled:opacity-50"
            >
              {t("addField.next")}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Preview & Confirm */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="app-card p-6">
            <h2 className="text-base font-bold text-slate-950">{t("addField.previewConfirmTitle")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("addField.previewConfirmHint")}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.targetObject")}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {objectLabel(targetObject, t)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.fieldLabel")}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{label}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.fieldKey")}</p>
                <p className="mt-0.5 text-sm font-mono font-semibold text-slate-800">{fieldKey}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.fieldType")}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {typeLabel(type, t)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.required")}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {required ? t("workspace.yes") : t("workspace.no")}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{t("addField.displayLocation")}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {showInList && showInForm
                    ? t("addField.locationListForm")
                    : showInList
                      ? t("addField.locationListOnly")
                      : showInForm
                        ? t("addField.locationFormOnly")
                        : t("addField.locationNone")}
                </p>
              </div>
              {type === "select" && options.length > 0 && (
                <div className="rounded-lg bg-slate-50 px-4 py-3 sm:col-span-2">
                  <p className="text-xs text-slate-500">{t("addField.dropdownOptions")}</p>
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
              <p className="text-sm text-slate-600">{t("addField.generatingPreview")}</p>
            </div>
          )}

          {prepareError && (
            <div className="app-error">
              <p className="font-medium">{t("addField.previewFailedTitle")}</p>
              <p className="mt-1 text-xs">{prepareError}</p>
              <button
                type="button"
                onClick={() => {
                  setPrepareError(null);
                  void preparePreview();
                }}
                className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {t("addField.regenerate")}
              </button>
            </div>
          )}

          {diff && !preparing && !prepareError && (
            <>
              <DiffPreview diff={diff} />
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("addField.approvalPoint")}
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
              {t("addField.prev")}
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
              {t("addField.confirmApply")}
              <CheckCircle2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
