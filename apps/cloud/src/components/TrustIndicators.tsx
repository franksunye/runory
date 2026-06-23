"use client";

import { Download, ShieldCheck, Sparkles, Undo2 } from "lucide-react";

interface TrustIndicatorsProps {
  className?: string;
}

interface Indicator {
  label: string;
  icon: typeof Download;
  tone: string;
}

const INDICATORS: Indicator[] = [
  { label: "数据可导出", icon: Download, tone: "bg-emerald-50 text-emerald-600" },
  { label: "变更可回滚", icon: Undo2, tone: "bg-amber-50 text-amber-600" },
  { label: "操作有审计", icon: ShieldCheck, tone: "bg-blue-50 text-blue-600" },
];

export default function TrustIndicators({ className = "" }: TrustIndicatorsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {INDICATORS.map(({ label, icon: Icon, tone }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
        >
          <span className={`grid size-5 place-items-center rounded ${tone}`}>
            <Icon size={12} />
          </span>
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">
        <Sparkles size={12} />
        Early Access
      </span>
    </div>
  );
}
