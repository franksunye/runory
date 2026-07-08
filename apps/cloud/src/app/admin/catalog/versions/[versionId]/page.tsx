"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Snowflake,
  ArrowUpCircle,
  AlertTriangle,
  Ban,
  XCircle,
  Package,
} from "lucide-react";
import {
  type CatalogVersion,
  type CatalogItem,
  type CatalogRelease,
  type ValidationRunRecord,
  LIFECYCLE_BADGE,
  RELEASE_BADGE,
  VALIDATION_STATUS_BADGE,
  ActionButton,
  ConfirmDialog,
  toList,
  parseManifest,
  formatDateTime,
  formatDuration,
  useAdminFetch,
} from "../../../_components/shared";
import { apiFetch, apiPost } from "@/lib/api-fetch";

export default function VersionDetailPage() {
  const params = useParams<{ versionId: string }>();
  const versionId = params.versionId;

  const { data: version, loading: versionLoading, error: versionError, reload: reloadVersion } = useAdminFetch<CatalogVersion>(
    `/api/platform/catalog/versions/${versionId}`
  );
  const { data: validationRuns, reload: reloadValidation } = useAdminFetch<ValidationRunRecord[]>(
    `/api/platform/catalog/versions/${versionId}/validate`
  );

  const [item, setItem] = useState<CatalogItem | null>(null);
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "withdraw" | "deprecate" | "reject" | "promote";
    channel?: "internal" | "beta" | "stable";
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadAux = useCallback(async () => {
    if (!version) return;
    try {
      const [itemJson, releasesJson] = await Promise.all([
        apiFetch<{ success: boolean; data?: CatalogItem }>(`/api/platform/catalog/${version.catalogItemId}`, { cache: "no-store" }),
        apiFetch<{ success: boolean; data?: CatalogRelease[] }>(`/api/platform/releases`, { cache: "no-store" }),
      ]);
      if (itemJson.success) setItem(itemJson.data ?? null);
      if (releasesJson.success) {
        const all: CatalogRelease[] = releasesJson.data ?? [];
        setReleases(all.filter((r) => r.catalogVersionId === versionId));
      }
    } catch {
      // ignore
    }
  }, [version, versionId]);

  useEffect(() => { loadAux(); }, [loadAux]);

  const doAction = async (action: string, body?: Record<string, unknown>) => {
    setActionLoading(action);
    setActionError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/catalog/versions/${versionId}/${action}`, body ?? {});
      if (!json.success) {
        setActionError(json.error?.message ?? `${action} 失败`);
      } else {
        reloadVersion();
        if (action === "validate") reloadValidation();
      }
    } catch {
      setActionError(`${action} 失败`);
    } finally {
      setActionLoading(null);
    }
  };

  const openConfirm = (type: "withdraw" | "deprecate" | "reject" | "promote", channel?: "internal" | "beta" | "stable") => {
    setConfirmAction({ type, channel });
    setConfirmReason("");
    setActionError(null);
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmAction(null);
    setConfirmReason("");
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    if (confirmReason.trim().length < 10) return;
    const { type, channel } = confirmAction;
    setConfirmBusy(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { reason: confirmReason.trim() };
      if (type === "promote" && channel) {
        body.channel = channel;
      }
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/catalog/versions/${versionId}/${type}`, body);
      if (!json.success) {
        setActionError(json.error?.message ?? `${type} 失败`);
      } else {
        setConfirmAction(null);
        setConfirmReason("");
        reloadVersion();
        loadAux();
      }
    } catch {
      setActionError(`${type} 失败`);
    } finally {
      setConfirmBusy(false);
    }
  };

  if (versionLoading) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  if (versionError || !version) {
    return (
      <div>
        <Link href="/admin?tab=catalog" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> 返回 Catalog
        </Link>
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {versionError ?? "未找到版本"}
        </div>
      </div>
    );
  }

  const badge = LIFECYCLE_BADGE[version.lifecycleStatus];
  const manifest = parseManifest(version.manifestJson);
  const versionReleases = releases;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin?tab=catalog" className="hover:text-slate-700">Catalog</Link>
        <ChevronRight size={14} />
        {item ? (
          <Link href={`/admin/catalog/${item.id}`} className="hover:text-slate-700">{item.name}</Link>
        ) : (
          <span>...</span>
        )}
        <ChevronRight size={14} />
        <span className="font-mono text-slate-700">v{version.version}</span>
      </div>

      {/* Header */}
      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-950">v{version.version}</h1>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
          <badge.icon size={12} /> {badge.label}
        </span>
        {versionReleases.map((rel) => (
          <span key={rel.id} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELEASE_BADGE[rel.channel].color}`}>
            {RELEASE_BADGE[rel.channel].label} · {rel.status}
          </span>
        ))}
      </div>

      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      {/* Metadata */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">版本元数据</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <MetaRow label="Schema 版本" value={version.manifestSchemaVersion} />
            <MetaRow label="生命周期" value={badge.label} />
            <MetaRow label="创建者" value={version.createdBy} mono />
            <MetaRow label="创建时间" value={formatDateTime(version.createdAt)} />
            {version.frozenAt && <MetaRow label="冻结时间" value={formatDateTime(version.frozenAt)} />}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Provenance & Artifact</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {version.sourceRepository && <MetaRow label="源仓库" value={version.sourceRepository} mono />}
            {version.sourceCommit && <MetaRow label="源 Commit" value={version.sourceCommit} mono />}
            {version.buildId && <MetaRow label="Build ID" value={version.buildId} mono />}
            {version.artifactUri && <MetaRow label="Artifact URI" value={version.artifactUri} mono />}
            {version.artifactChecksum && (
              <div>
                <dt className="text-xs font-semibold text-slate-500">Artifact Checksum (SHA-256)</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-slate-600">{version.artifactChecksum}</dd>
              </div>
            )}
            {!version.sourceRepository && !version.artifactUri && (
              <p className="text-xs text-slate-400">无 provenance 信息</p>
            )}
          </dl>
        </div>
      </div>

      {/* Manifest sections */}
      {manifest ? (
        <ManifestSections manifest={manifest} itemType={item?.itemType} />
      ) : (
        <div className="mt-6 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          Manifest 无法解析。
        </div>
      )}

      {/* Validation runs */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">验证记录</h2>
          <Link
            href={`/admin/catalog/versions/${versionId}/validation`}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            查看全部
          </Link>
        </div>
        {(validationRuns ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无验证记录。</p>
        ) : (
          <div className="mt-3 space-y-2">
            {(validationRuns ?? []).slice(0, 3).map((run) => {
              const statusBadge = VALIDATION_STATUS_BADGE[run.status];
              return (
                <Link
                  key={run.id}
                  href={`/admin/catalog/versions/${versionId}/validation`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.color}`}>{statusBadge.label}</span>
                    <span className="font-mono text-xs text-slate-500">{run.id}</span>
                    {run.validatorVersion && <span className="text-xs text-slate-400">v{run.validatorVersion}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{formatDateTime(run.createdAt)}</span>
                    <span>耗时 {formatDuration(run.startedAt, run.completedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-950">操作</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {version.lifecycleStatus === "draft" && (
            <>
              <ActionButton
                label="验证"
                icon={ShieldCheck}
                loading={actionLoading === "validate"}
                onClick={() => doAction("validate")}
              />
              <ActionButton
                label="冻结"
                icon={Snowflake}
                loading={actionLoading === "freeze"}
                onClick={() => doAction("freeze")}
              />
              <ActionButton
                label="拒绝"
                icon={XCircle}
                variant="danger"
                loading={actionLoading === "reject"}
                onClick={() => openConfirm("reject")}
              />
            </>
          )}
          {version.lifecycleStatus === "ready" && (
            <>
              <ActionButton
                label="发布 Internal"
                icon={ArrowUpCircle}
                loading={actionLoading === "promote:internal"}
                onClick={() => openConfirm("promote", "internal")}
              />
              <ActionButton
                label="发布 Beta"
                icon={ArrowUpCircle}
                loading={actionLoading === "promote:beta"}
                onClick={() => openConfirm("promote", "beta")}
              />
              <ActionButton
                label="发布 Stable"
                icon={ArrowUpCircle}
                variant="success"
                loading={actionLoading === "promote:stable"}
                onClick={() => openConfirm("promote", "stable")}
              />
              <ActionButton
                label="废弃"
                icon={AlertTriangle}
                variant="warning"
                loading={actionLoading === "deprecate"}
                onClick={() => openConfirm("deprecate")}
              />
              <ActionButton
                label="撤回"
                icon={Ban}
                variant="danger"
                loading={actionLoading === "withdraw"}
                onClick={() => openConfirm("withdraw")}
              />
              {item?.itemType === "pack" && (
                <ActionButton
                  label="解析 Pack Lock"
                  icon={Package}
                  loading={actionLoading === "lock"}
                  onClick={() => doAction("lock")}
                />
              )}
            </>
          )}
          {version.lifecycleStatus === "deprecated" && (
            <ActionButton
              label="撤回"
              icon={Ban}
              variant="danger"
              loading={actionLoading === "withdraw"}
              onClick={() => openConfirm("withdraw")}
            />
          )}
          {(version.lifecycleStatus === "validating" || version.lifecycleStatus === "rejected" || version.lifecycleStatus === "withdrawn") && (
            <p className="text-sm text-slate-400">当前状态无可用操作。</p>
          )}
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          type={confirmAction.type}
          channel={confirmAction.channel}
          reason={confirmReason}
          onReasonChange={setConfirmReason}
          busy={confirmBusy}
          onCancel={closeConfirm}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

// ── Meta Row ──

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`text-right text-sm text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

// ── Manifest Sections ──

function ManifestSections({
  manifest,
  itemType,
}: {
  manifest: Record<string, unknown>;
  itemType?: "module" | "pack" | "template";
}) {
  const m = manifest as any;
  const objects = toList(m.objects);
  const views = toList(m.views);
  const permissions = Array.isArray(m.permissions)
    ? m.permissions.map(String)
    : m.permissions && typeof m.permissions === "object"
      ? Object.entries(m.permissions as Record<string, unknown>).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      : [];
  const extensionPoints = m.extensionPoints;
  const migrations = m.migrations;
  const ui = m.ui;
  const modules = toList(m.modules);
  const packs = toList(m.packs);

  return (
    <div className="mt-6 space-y-4">
      {/* Objects */}
      {objects.length > 0 && (
        <Section title="Objects & Fields">
          <div className="space-y-3">
            {objects.map((object: any, index: number) => {
              const fields = toList(object.fields);
              const objectKey = String(object.key ?? object.objectKey ?? object.name ?? `object-${index + 1}`);
              return (
                <div key={objectKey} className="rounded-lg border border-slate-100">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {objectKey}
                      {object.label ? <span className="ml-2 font-normal text-slate-500">{String(object.label)}</span> : null}
                    </p>
                  </div>
                  {fields.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">无字段声明</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Field</th>
                            <th className="px-3 py-2 text-left font-semibold">Label</th>
                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                            <th className="px-3 py-2 text-left font-semibold">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {fields.map((field: any, fieldIndex: number) => (
                            <tr key={String(field.key ?? field.fieldKey ?? fieldIndex)}>
                              <td className="px-3 py-2 font-mono text-slate-700">{String(field.key ?? field.fieldKey ?? "—")}</td>
                              <td className="px-3 py-2 text-slate-600">{String(field.label ?? "—")}</td>
                              <td className="px-3 py-2 text-slate-600">{String(field.type ?? "—")}</td>
                              <td className="px-3 py-2 text-slate-600">{field.required ? "yes" : "no"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Views */}
      {views.length > 0 && (
        <Section title="Views">
          <div className="space-y-2">
            {views.map((view: any, index: number) => {
              const viewKey = String(view.key ?? view.viewKey ?? view.name ?? `view-${index + 1}`);
              const columns = toList(view.columns);
              const sections = toList(view.sections);
              const actions = toList(view.actions);
              return (
                <div key={viewKey} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{viewKey}</p>
                    {view.type && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{String(view.type)}</span>}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                    <div>
                      <span className="font-semibold text-slate-500">Columns:</span> {columns.length}
                      {columns.length > 0 && (
                        <span className="ml-1 font-mono">({columns.map((c: any) => String(c.key ?? c)).join(", ")})</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Sections:</span> {sections.length}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Actions:</span> {actions.length}
                      {actions.length > 0 && (
                        <span className="ml-1 font-mono">({actions.map((a: any) => String(a.key ?? a.label ?? a)).join(", ")})</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Permissions */}
      {permissions.length > 0 && (
        <Section title="Permissions">
          <ul className="space-y-1 text-xs text-slate-600">
            {permissions.map((permission: string) => (
              <li key={permission} className="rounded bg-slate-50 px-2 py-1 font-mono">{permission}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Extension Points */}
      {extensionPoints && (
        <Section title="Extension Points">
          <ExtensionPointsView data={extensionPoints} />
        </Section>
      )}

      {/* Migrations */}
      {migrations && (
        <Section title="Migrations">
          <MigrationsView data={migrations} />
        </Section>
      )}

      {/* UI / Navigation */}
      {ui && (
        <Section title="UI & Navigation">
          <UiView data={ui} />
        </Section>
      )}

      {/* Pack composition */}
      {itemType === "pack" && modules.length > 0 && (
        <Section title="Pack Modules">
          <ul className="grid gap-2 sm:grid-cols-2">
            {modules.map((moduleRef) => (
              <li key={String(moduleRef)} className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {String(moduleRef)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Template packs */}
      {itemType === "template" && packs.length > 0 && (
        <Section title="Template Packs">
          <ul className="grid gap-2 sm:grid-cols-2">
            {packs.map((packRef) => (
              <li key={String(packRef)} className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {String(packRef)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Raw manifest */}
      <Section title="原始 Manifest (JSON)">
        <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ExtensionPointsView({ data }: { data: unknown }) {
  const d = data as any;
  const entities = toList(d.entities);
  const viewSlots = toList(d.views);

  return (
    <div className="space-y-3">
      {entities.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500">Entities (customFields)</p>
          <ul className="mt-1 space-y-1">
            {entities.map((entity: any, index: number) => (
              <li key={String(entity.entity ?? entity.key ?? index)} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                <span className="font-mono font-semibold">{String(entity.entity ?? entity.key ?? `entity-${index + 1}`)}</span>
                {entity.customFields && (
                  <span className="ml-2 text-slate-400">customFields: {JSON.stringify(entity.customFields)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {viewSlots.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500">Views (slots)</p>
          <ul className="mt-1 space-y-1">
            {viewSlots.map((view: any, index: number) => (
              <li key={String(view.view ?? view.key ?? index)} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                <span className="font-mono font-semibold">{String(view.view ?? view.key ?? `view-${index + 1}`)}</span>
                {view.slots && <span className="ml-2 text-slate-400">slots: {JSON.stringify(view.slots)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {entities.length === 0 && viewSlots.length === 0 && (
        <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

function MigrationsView({ data }: { data: unknown }) {
  const d = data as any;
  const install = d.install;
  const upgrades = toList(d.upgrade);

  return (
    <div className="space-y-3">
      {install && (
        <div>
          <p className="text-xs font-semibold text-slate-500">Install Script</p>
          <pre className="mt-1 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {typeof install === "string" ? install : JSON.stringify(install, null, 2)}
          </pre>
        </div>
      )}
      {upgrades.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500">Upgrade Steps</p>
          <ul className="mt-1 space-y-1">
            {upgrades.map((step: any, index: number) => (
              <li key={index} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                <span className="font-mono font-semibold">{String(step.from ?? "?")} → {String(step.to ?? "?")}</span>
                {step.script && <span className="ml-2 text-slate-400">script: {String(step.script).slice(0, 80)}...</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!install && upgrades.length === 0 && (
        <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

function UiView({ data }: { data: unknown }) {
  const d = data as any;
  const navItems = toList(d.navigation);

  return (
    <div className="space-y-3">
      {navItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500">Navigation Items</p>
          <ul className="mt-1 space-y-1">
            {navItems.map((item: any, index: number) => (
              <li key={String(item.key ?? item.label ?? index)} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                <span className="font-mono font-semibold">{String(item.key ?? item.label ?? `nav-${index + 1}`)}</span>
                {item.label && <span className="ml-2 text-slate-400">{String(item.label)}</span>}
                {item.path && <span className="ml-2 text-slate-400">→ {String(item.path)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {navItems.length === 0 && (
        <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
