"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

const STORAGE_KEY = "runory:early-access-banner-dismissed";

export default function EarlyAccessBanner() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
  };

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
      <Info size={16} className="shrink-0 text-blue-600" />
      <p className="flex-1">
        {t("workspace.earlyAccess.message")}
        <Link href="/account" className="ml-1 font-semibold underline underline-offset-2 hover:text-blue-900">
          {t("workspace.earlyAccess.viewPlans")}
        </Link>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("workspace.earlyAccess.dismiss")}
        className="grid size-6 shrink-0 place-items-center rounded-md text-blue-500 transition hover:bg-blue-100 hover:text-blue-700"
      >
        <X size={14} />
      </button>
    </div>
  );
}
