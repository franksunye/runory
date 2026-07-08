"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CreditCard, Download, FileText, GitBranch, Inbox, Key,
  Package, ScrollText, Settings, SlidersHorizontal, Trash2, Users, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch } from "@/lib/api-fetch";

interface ManageCard {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  route: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const MANAGE_CARDS: ManageCard[] = [
  { titleKey: "manage.modules", descriptionKey: "manage.modulesDesc", route: "/modules", icon: Package },
  { titleKey: "manage.customize", descriptionKey: "manage.customizeDesc", route: "/customize", icon: SlidersHorizontal },
  { titleKey: "manage.workflows", descriptionKey: "manage.workflowsDesc", route: "/workflows", icon: GitBranch },
  { titleKey: "manage.automations", descriptionKey: "manage.automationsDesc", route: "/automations", icon: Zap },
  { titleKey: "manage.forms", descriptionKey: "manage.formsDesc", route: "/forms", icon: FileText },
  { titleKey: "manage.outbox", descriptionKey: "manage.outboxDesc", route: "/outbox", icon: Inbox },
  { titleKey: "manage.migration", descriptionKey: "manage.migrationDesc", route: "/migration", icon: ArrowLeft },
  { titleKey: "manage.members", descriptionKey: "manage.membersDesc", route: "/members", icon: Users },
  { titleKey: "manage.audit", descriptionKey: "manage.auditDesc", route: "/audit", icon: ScrollText },
  { titleKey: "manage.trash", descriptionKey: "manage.trashDesc", route: "/trash", icon: Trash2 },
  { titleKey: "manage.export", descriptionKey: "manage.exportDesc", route: "/export", icon: Download },
  { titleKey: "manage.apiKeys", descriptionKey: "manage.apiKeysDesc", route: "/api-keys", icon: Key },
  { titleKey: "manage.settings", descriptionKey: "manage.settingsDesc", route: "/settings", icon: Settings },
  { titleKey: "manage.billing", descriptionKey: "manage.billingDesc", route: "/billing", icon: CreditCard, adminOnly: true },
];

export default function ManagePage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const json = await apiFetch<{
        success: boolean;
        data?: { organizationRole?: string };
      }>(`/api/workspaces/${workspaceId}`);
      if (json.success) setRole(json.data?.organizationRole ?? "member");
      } catch {
        setRole("member");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  const canManageBilling = role === "owner" || role === "admin";
  const cards = MANAGE_CARDS.filter((c) => !c.adminOnly || canManageBilling);

  return (
    <div className="space-y-6">
      <header>
        <p className="app-eyebrow">Manage</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("manage.title")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("manage.subtitle")}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ titleKey, descriptionKey, route, icon: Icon }) => (
          <Link
            key={route}
            href={`/w/${workspaceId}${route}`}
            className="app-card group flex flex-col p-5 transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
                <Icon size={20} />
              </span>
              <h2 className="text-base font-bold text-slate-950">{t(titleKey)}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">{t(descriptionKey)}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 transition group-hover:opacity-100">
              {t("manage.enter")}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
