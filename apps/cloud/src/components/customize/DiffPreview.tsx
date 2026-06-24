"use client";

import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

interface AddedField {
  object: string;
  fieldKey: string;
  label: string;
  type: string;
  listColumn: boolean;
  slot: string | null;
}

interface DiffData {
  plan?: {
    customFields?: Array<{
      targetObject: string;
      fieldKey: string;
      label: string;
      type: string;
      required: boolean;
      validation?: { options?: string[] } | Record<string, unknown>;
    }>;
  };
  addedFields?: AddedField[];
  affectedViews?: string[];
  riskLevel?: string;
}

interface DiffPreviewProps {
  diff: DiffData | null;
}

const OBJECT_LABEL_KEY: Record<string, MessageKey> = {
  customer: "diff.object.customer",
  contact: "diff.object.contact",
  task: "diff.object.task",
};

const TYPE_LABEL_KEY: Record<string, MessageKey> = {
  text: "extension.type.text",
  email: "extension.type.email",
  phone: "extension.type.phone",
  number: "extension.type.number",
  date: "extension.type.date",
  select: "extension.type.select",
  boolean: "extension.type.boolean",
};

const RISK_LABEL_KEY: Record<string, MessageKey> = {
  low: "extension.risk.low",
  medium: "extension.risk.medium",
  high: "extension.risk.high",
};

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

function objectLabel(key: string, t: TFunc): string {
  const msgKey = OBJECT_LABEL_KEY[key];
  return msgKey ? t(msgKey) : key;
}

function typeLabel(key: string, t: TFunc): string {
  const msgKey = TYPE_LABEL_KEY[key];
  return msgKey ? t(msgKey) : key;
}

function viewLabel(viewKey: string, t: TFunc): string {
  const parts = viewKey.split("_");
  if (parts.length >= 2) {
    const obj = objectLabel(parts[0], t);
    const viewType = parts[1];
    if (viewType === "list") return t("diff.listView", { object: obj });
    if (viewType === "form") return t("diff.formView", { object: obj });
  }
  return viewKey;
}

export default function DiffPreview({ diff }: DiffPreviewProps) {
  const { t } = useI18n();

  if (!diff) {
    return <p className="text-sm text-slate-500">{t("diff.noPreviewData")}</p>;
  }

  const addedFields: AddedField[] = diff.addedFields ?? [];
  const affectedViews: string[] = diff.affectedViews ?? [];
  const riskLevel: string = diff.riskLevel ?? "low";

  const planFields = diff.plan?.customFields ?? [];
  const fieldRequiredMap = new Map(
    planFields.map((f) => [`${f.targetObject}.${f.fieldKey}`, f.required])
  );
  const fieldOptionsMap = new Map(
    planFields.map((f) => [
      `${f.targetObject}.${f.fieldKey}`,
      (f.validation as { options?: string[] } | undefined)?.options ?? [],
    ])
  );

  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{t("diff.changePreview")}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            riskColors[riskLevel] ?? riskColors.low
          }`}
        >
          {RISK_LABEL_KEY[riskLevel] ? t(RISK_LABEL_KEY[riskLevel]) : riskLevel}
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("diff.addedFields", { count: addedFields.length })}
        </h4>
        {addedFields.length === 0 ? (
          <p className="text-sm text-slate-400">{t("diff.noAddedFields")}</p>
        ) : (
          <ul className="space-y-2">
            {addedFields.map((f, i) => {
              const required = fieldRequiredMap.get(`${f.object}.${f.fieldKey}`) ?? false;
              const options = fieldOptionsMap.get(`${f.object}.${f.fieldKey}`) ?? [];
              return (
                <li
                  key={i}
                  className="rounded-md bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <p className="text-slate-800">
                    {t("diff.fieldWillBeAdded", { object: objectLabel(f.object, t), label: f.label })}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("diff.fieldType", { type: typeLabel(f.type, t) })}
                    {required && <span className="ml-2 text-red-600">· {t("diff.required")}</span>}
                    {options.length > 0 && (
                      <span className="ml-2">· {t("diff.options", { options: options.join("、") })}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("diff.affectedViewsShort", { count: affectedViews.length })}
        </h4>
        {affectedViews.length === 0 ? (
          <p className="text-sm text-slate-400">{t("diff.noAffectedViews")}</p>
        ) : (
          <ul className="space-y-1">
            {affectedViews.map((v) => (
              <li key={v} className="text-sm text-slate-600">
                {t("diff.willAppearIn", { view: viewLabel(v, t) })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
