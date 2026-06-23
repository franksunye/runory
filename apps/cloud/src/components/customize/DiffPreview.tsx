"use client";

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

const OBJECT_LABELS: Record<string, string> = {
  customer: "客户",
  contact: "联系人",
  task: "任务",
};

const TYPE_LABELS: Record<string, string> = {
  text: "文本",
  email: "邮箱",
  phone: "电话",
  number: "数字",
  date: "日期",
  select: "下拉选择",
  boolean: "是/否",
};

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

const riskLabels: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

function objectLabel(key: string): string {
  return OBJECT_LABELS[key] ?? key;
}

function typeLabel(key: string): string {
  return TYPE_LABELS[key] ?? key;
}

function viewLabel(viewKey: string): string {
  const parts = viewKey.split("_");
  if (parts.length >= 2) {
    const obj = objectLabel(parts[0]);
    const viewType = parts[1];
    if (viewType === "list") return `${obj}列表`;
    if (viewType === "form") return `${obj}表单`;
  }
  return viewKey;
}

export default function DiffPreview({ diff }: DiffPreviewProps) {
  if (!diff) {
    return <p className="text-sm text-slate-500">暂无预览数据</p>;
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
        <h3 className="text-sm font-semibold text-slate-700">变更预览</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            riskColors[riskLevel] ?? riskColors.low
          }`}
        >
          {riskLabels[riskLevel] ?? riskLevel}
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          新增字段（{addedFields.length}）
        </h4>
        {addedFields.length === 0 ? (
          <p className="text-sm text-slate-400">无新增字段</p>
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
                    将在<span className="font-semibold">{objectLabel(f.object)}</span>对象添加字段「<span className="font-semibold">{f.label}</span>」
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    类型：{typeLabel(f.type)}
                    {required && <span className="ml-2 text-red-600">· 必填</span>}
                    {options.length > 0 && (
                      <span className="ml-2">· 选项：{options.join("、")}</span>
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
          影响视图（{affectedViews.length}）
        </h4>
        {affectedViews.length === 0 ? (
          <p className="text-sm text-slate-400">无受影响视图</p>
        ) : (
          <ul className="space-y-1">
            {affectedViews.map((v) => (
              <li key={v} className="text-sm text-slate-600">
                将出现在<span className="font-medium text-slate-800">{viewLabel(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
