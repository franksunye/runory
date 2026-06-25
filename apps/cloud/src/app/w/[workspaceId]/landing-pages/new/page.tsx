"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchemaForm from "@/components/SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";

const OBJECT_KEY = "landing_page";
const VIEW_KEY = "landing_page_form";

export default function NewLandingPagePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const workspaceId = params.workspaceId as string;

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [viewConfig, setViewConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [objRes, viewsRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}`),
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/views`),
        ]);
        const objJson = await objRes.json();
        const viewsJson = await viewsRes.json();
        if (objJson.success) setFields(objJson.data.fields);
        if (viewsJson.success) {
          const view = viewsJson.data.find(
            (v: any) => v.viewKey === VIEW_KEY
          );
          setViewConfig(view?.config ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, t]);

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.success) {
        router.push(`/w/${workspaceId}/landing-pages`);
        router.refresh();
      } else {
        setError(json.error?.message ?? t("workspace.createFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("landingPages.new.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("landingPages.new.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          onSubmit={handleSubmit}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
        />
      ) : (
        <p className="text-sm text-slate-500">{t("landingPages.new.formNotFound")}</p>
      )}
    </div>
  );
}
