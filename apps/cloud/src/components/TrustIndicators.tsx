"use client";

import { Download, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

interface TrustIndicatorsProps {
  className?: string;
}

interface Indicator {
  key: MessageKey;
  icon: typeof Download;
  tone: string;
}

const INDICATORS: Indicator[] = [
  { key: "trust.dataExportable", icon: Download, tone: "bg-emerald-50 text-emerald-600" },
  { key: "trust.rollback", icon: Undo2, tone: "bg-amber-50 text-amber-600" },
  { key: "trust.audited", icon: ShieldCheck, tone: "bg-blue-50 text-blue-600" },
];

export default function TrustIndicators({ className = "" }: TrustIndicatorsProps) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {INDICATORS.map(({ key, icon: Icon, tone }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
        >
          <span className={`grid size-5 place-items-center rounded ${tone}`}>
            <Icon size={12} />
          </span>
          {t(key)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">
        <Sparkles size={12} />
        Early Access
      </span>
    </div>
  );
}
