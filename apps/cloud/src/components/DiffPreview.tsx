"use client";

interface DiffPreviewProps {
  diff: any;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

export default function DiffPreview({ diff }: DiffPreviewProps) {
  if (!diff) {
    return <p className="text-sm text-slate-500">暂无预览数据</p>;
  }

  const addedFields: any[] = diff.addedFields ?? [];
  const affectedViews: string[] = diff.affectedViews ?? [];
  const riskLevel: string = diff.riskLevel ?? "low";

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">扩展变更预览</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            riskColors[riskLevel] ?? riskColors.low
          }`}
        >
          风险等级：{riskLevel}
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          新增字段（{addedFields.length}）
        </h4>
        {addedFields.length === 0 ? (
          <p className="text-sm text-slate-400">无新增字段</p>
        ) : (
          <ul className="space-y-1">
            {addedFields.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">{f.label}</span>
                <span className="text-xs text-slate-500">
                  {f.object}.{f.fieldKey}
                </span>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  {f.type}
                </span>
                {f.listColumn && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                    列表列
                  </span>
                )}
                {f.slot && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                    slot: {f.slot}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          受影响的视图（{affectedViews.length}）
        </h4>
        {affectedViews.length === 0 ? (
          <p className="text-sm text-slate-400">无受影响视图</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {affectedViews.map((v) => (
              <span
                key={v}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
