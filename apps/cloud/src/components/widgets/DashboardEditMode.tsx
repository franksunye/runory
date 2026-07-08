"use client";

import { useState, useCallback } from "react";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, Plus, Settings2, Sliders, X,
} from "lucide-react";
import type {
  WidgetDeclaration, DashboardZone, WidgetConfigurableField,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiPatch, apiDelete } from "@/lib/api-fetch";

// ── Types ──

interface LayoutItem {
  zone: DashboardZone;
  moduleId: string;
  widgetKey: string;
  instance: string;
  position: number;
  hidden: boolean;
  configOverride: Record<string, unknown> | null;
  widget: WidgetDeclaration;
}

interface AvailableWidget {
  moduleId: string;
  widgetKey: string;
  label: string;
  type: string;
  icon: string;
}

interface DashboardEditModeProps {
  workspaceId: string;
  layout: LayoutItem[];
  availableWidgets: AvailableWidget[];
  zones: DashboardZone[];
  onLayoutChange: (layout: LayoutItem[]) => void;
  onReset: () => void;
  onClose: () => void;
}

// Identity key for a layout item (stable across re-renders)
function itemKey(item: { moduleId: string; widgetKey: string; instance: string }): string {
  return `${item.moduleId}:${item.widgetKey}:${item.instance}`;
}

// Shorten a module id like "runory.work-order" → "work-order" for compact display
function shortModuleLabel(moduleId: string): string {
  const idx = moduleId.lastIndexOf(".");
  return idx >= 0 ? moduleId.slice(idx + 1) : moduleId;
}

// ── Nested path helpers (for configurable.path like "data.limit") ──

function getNestedValue(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setNestedValue(
  obj: Record<string, unknown> | null,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = path.split(".");
  const root: Record<string, unknown> = obj ? structuredClone(obj) : {};
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

// ── Main Component ──

const ZONE_LABEL_KEY: Record<DashboardZone, MessageKey> = {
  metrics: "dashboard.zone.metrics",
  trends: "dashboard.zone.trends",
  lists: "dashboard.zone.lists",
  activity: "dashboard.zone.activity",
};

export default function DashboardEditMode({
  workspaceId,
  layout,
  availableWidgets,
  zones,
  onLayoutChange,
  onReset,
  onClose,
}: DashboardEditModeProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState<DashboardZone | false>(false);
  const [configuringKey, setConfiguringKey] = useState<string | null>(null);

  const saveUpdates = useCallback(async (updates: Array<{
    zone: DashboardZone;
    widgetModule: string;
    widgetKey: string;
    widgetInstance: string;
    position?: number;
    hidden?: boolean;
    configOverride?: Record<string, unknown> | null;
  }>) => {
    setSaving(true);
    setError(null);
    try {
      const json = await apiPatch<{
        success: boolean;
        error?: { message: string };
        data: { layout: LayoutItem[] };
      }>(
        `/api/workspaces/${workspaceId}/dashboard/layout`,
        { updates }
      );
      if (!json.success) throw new Error(json.error?.message ?? t("dashboard.saveFailed"));
      onLayoutChange(json.data.layout);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dashboard.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [workspaceId, onLayoutChange, t]);

  const handleConfigureSave = useCallback((item: LayoutItem, override: Record<string, unknown> | null) => {
    void saveUpdates([{
      zone: item.zone,
      widgetModule: item.moduleId,
      widgetKey: item.widgetKey,
      widgetInstance: item.instance,
      configOverride: override,
    }]);
    setConfiguringKey(null);
  }, [saveUpdates]);

  const handleHide = (item: LayoutItem) => {
    void saveUpdates([{
      zone: item.zone,
      widgetModule: item.moduleId,
      widgetKey: item.widgetKey,
      widgetInstance: item.instance,
      hidden: true,
    }]);
  };

  const handleShow = (item: LayoutItem) => {
    void saveUpdates([{
      zone: item.zone,
      widgetModule: item.moduleId,
      widgetKey: item.widgetKey,
      widgetInstance: item.instance,
      hidden: false,
    }]);
  };

  const handleMove = (item: LayoutItem, direction: "up" | "down") => {
    const zoneItems = layout.filter((i) => i.zone === item.zone).sort((a, b) => a.position - b.position);
    const currentIndex = zoneItems.findIndex((i) =>
      i.moduleId === item.moduleId && i.widgetKey === item.widgetKey && i.instance === item.instance
    );
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= zoneItems.length) return;

    const targetItem = zoneItems[targetIndex];
    // Swap positions
    void saveUpdates([
      {
        zone: item.zone,
        widgetModule: item.moduleId,
        widgetKey: item.widgetKey,
        widgetInstance: item.instance,
        position: targetItem.position,
      },
      {
        zone: targetItem.zone,
        widgetModule: targetItem.moduleId,
        widgetKey: targetItem.widgetKey,
        widgetInstance: targetItem.instance,
        position: item.position,
      },
    ]);
  };

  const handleAdd = (widget: AvailableWidget, zone: DashboardZone) => {
    const zoneItems = layout.filter((i) => i.zone === zone);
    const maxPosition = zoneItems.length > 0 ? Math.max(...zoneItems.map((i) => i.position)) : -1;
    void saveUpdates([{
      zone,
      widgetModule: widget.moduleId,
      widgetKey: widget.widgetKey,
      widgetInstance: "default",
      position: maxPosition + 1,
      hidden: false,
    }]);
    setShowAddPanel(false);
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const json = await apiDelete<{
        success: boolean;
        error?: { message: string };
        data: { layout: LayoutItem[] };
      }>(`/api/workspaces/${workspaceId}/dashboard/layout`);
      if (!json.success) throw new Error(json.error?.message ?? t("dashboard.resetFailed"));
      onLayoutChange(json.data.layout);
      onReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dashboard.resetFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Group layout by zone
  const layoutByZone = new Map<DashboardZone, LayoutItem[]>();
  for (const zone of zones) {
    layoutByZone.set(zone, layout.filter((i) => i.zone === zone).sort((a, b) => a.position - b.position));
  }

  // Find available widgets not yet on layout
  const onLayoutKeys = new Set(layout.map((i) => `${i.moduleId}:${i.widgetKey}`));
  const addableWidgets = availableWidgets.filter((w) => !onLayoutKeys.has(`${w.moduleId}:${w.widgetKey}`));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-indigo-600" />
          <span className="text-sm font-medium text-indigo-900">{t("dashboard.editMode")}</span>
          {saving && <span className="text-xs text-indigo-500">{t("workspace.saving")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleReset()}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
          >
            {t("dashboard.resetDefault")}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <X size={14} />{t("dashboard.done")}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="app-error">{error}</div>}

      {/* Zones */}
      {zones.map((zone) => {
        const items = layoutByZone.get(zone) ?? [];
        return (
          <div key={zone} className="app-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{t(ZONE_LABEL_KEY[zone])}</h3>
              <button
                onClick={() => setShowAddPanel(showAddPanel === zone ? false : zone)}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Plus size={12} />{t("dashboard.addWidget")}
              </button>
            </div>

            {items.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">{t("dashboard.emptyZone")}</p>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => {
                  const key = itemKey(item);
                  const configurable = item.widget.configurable ?? [];
                  const isConfiguring = configuringKey === key;
                  const hasConfigOverride = item.configOverride !== null && Object.keys(item.configOverride).length > 0;
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{item.widget.label}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {item.widget.type}
                          </span>
                          <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400" title={item.moduleId}>
                            {shortModuleLabel(item.moduleId)}
                          </span>
                          {item.hidden && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">{t("dashboard.hidden")}</span>
                          )}
                          {hasConfigOverride && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">{t("dashboard.customized")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {configurable.length > 0 && (
                            <button
                              onClick={() => setConfiguringKey(isConfiguring ? null : key)}
                              disabled={saving}
                              className={`rounded p-1 hover:bg-slate-100 disabled:opacity-30 ${
                                isConfiguring ? "text-indigo-600" : "text-slate-400 hover:text-slate-700"
                              }`}
                              title={t("dashboard.configure")}
                            >
                              <Sliders size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleMove(item, "up")}
                            disabled={index === 0 || saving}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            title={t("dashboard.moveUp")}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => handleMove(item, "down")}
                            disabled={index === items.length - 1 || saving}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            title={t("dashboard.moveDown")}
                          >
                            <ArrowDown size={14} />
                          </button>
                          {item.hidden ? (
                            <button
                              onClick={() => handleShow(item)}
                              disabled={saving}
                              className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                              title={t("dashboard.show")}
                            >
                              <Eye size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleHide(item)}
                              disabled={saving}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title={t("dashboard.hide")}
                            >
                              <EyeOff size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      {isConfiguring && configurable.length > 0 && (
                        <WidgetConfigPanel
                          item={item}
                          fields={configurable}
                          saving={saving}
                          onCancel={() => setConfiguringKey(null)}
                          onSave={(override) => handleConfigureSave(item, override)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Panel */}
            {showAddPanel === zone && (
              <div className="mt-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-600">{t("dashboard.availableWidgets")}</p>
                {addableWidgets.length === 0 ? (
                  <p className="text-xs text-slate-400">{t("dashboard.allWidgetsAdded")}</p>
                ) : (
                  <div className="space-y-1">
                    {addableWidgets.map((widget) => (
                      <button
                        key={`${widget.moduleId}:${widget.widgetKey}`}
                        onClick={() => handleAdd(widget, zone)}
                        disabled={saving}
                        className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm hover:border-indigo-300 hover:shadow-sm"
                      >
                        <span className="font-medium text-slate-700">{widget.label}</span>
                        <span className="flex items-center gap-1 text-xs text-indigo-600">
                          <Plus size={12} />{t("dashboard.add")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Widget Configuration Panel ──
// Renders form controls from widget.configurable[] and persists configOverride.

interface WidgetConfigPanelProps {
  item: LayoutItem;
  fields: WidgetConfigurableField[];
  saving: boolean;
  onCancel: () => void;
  onSave: (override: Record<string, unknown> | null) => void;
}

function WidgetConfigPanel({ item, fields, saving, onCancel, onSave }: WidgetConfigPanelProps) {
  const { t } = useI18n();
  // Seed local state from current configOverride; fall back to widget declaration defaults.
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = item.configOverride ? structuredClone(item.configOverride) : {};
    // Pre-fill any missing configurable paths with the widget's declared default
    for (const f of fields) {
      if (getNestedValue(seed, f.path) === undefined) {
        const declared = getNestedValue(item.widget as unknown as Record<string, unknown>, f.path);
        if (declared !== undefined) {
          // multiselect defaults to array; others copy as-is
          const initial = f.type === "multiselect" && !Array.isArray(declared)
            ? (declared ? [String(declared)] : [])
            : declared;
          const next = setNestedValue(seed, f.path, initial);
          Object.assign(seed, next);
        } else if (f.type === "multiselect") {
          const next = setNestedValue(seed, f.path, []);
          Object.assign(seed, next);
        }
      }
    }
    return seed;
  });

  const updateField = (path: string, value: unknown) => {
    setDraft((prev) => setNestedValue(prev, path, value));
  };

  const handleSave = () => {
    // Build a minimal override containing only configurable paths
    const override: Record<string, unknown> = {};
    for (const f of fields) {
      const val = getNestedValue(draft, f.path);
      if (val !== undefined) {
        Object.assign(override, setNestedValue(override, f.path, val));
      }
    }
    onSave(override);
  };

  const handleReset = () => {
    // Clear all configurable paths → null override restores pack defaults
    onSave(null);
  };

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">{t("dashboard.widgetConfig")}</p>
        <button
          onClick={handleReset}
          disabled={saving}
          className="text-[10px] text-slate-400 hover:text-slate-600 disabled:opacity-30"
        >
          {t("dashboard.restoreDefault")}
        </button>
      </div>
      <div className="space-y-3">
        {fields.map((field) => (
          <ConfigField
            key={field.path}
            field={field}
            value={getNestedValue(draft, field.path)}
            onChange={(v) => updateField(field.path, v)}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-30"
        >
          {t("workspace.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-30"
        >
          {saving ? t("workspace.saving") : t("workspace.save")}
        </button>
      </div>
    </div>
  );
}

// ── Single Config Field ──

interface ConfigFieldProps {
  field: WidgetConfigurableField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ConfigField({ field, value, onChange }: ConfigFieldProps) {
  const { t } = useI18n();
  const labelEl = (
    <label className="block text-xs font-medium text-slate-600">{field.label}</label>
  );

  if (field.type === "select") {
    return (
      <div>
        {labelEl}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      if (selected.includes(opt)) {
        onChange(selected.filter((v) => v !== opt));
      } else {
        onChange([...selected, opt]);
      }
    };
    return (
      <div>
        {labelEl}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                }`}
              >
                {opt}
              </button>
            );
          })}
          {selected.length === 0 && (
            <span className="text-[10px] text-slate-400">{t("dashboard.notSelected")}</span>
          )}
        </div>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          min={field.min}
          max={field.max}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(undefined);
              return;
            }
            const n = Number(raw);
            if (Number.isNaN(n)) return;
            if (field.min !== undefined && n < field.min) return;
            if (field.max !== undefined && n > field.max) return;
            onChange(n);
          }}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
        />
        {(field.min !== undefined || field.max !== undefined) && (
          <p className="mt-0.5 text-[10px] text-slate-400">
            {field.min !== undefined && field.max !== undefined
              ? t("dashboard.rangeMinMax", { min: field.min, max: field.max })
              : field.min !== undefined
                ? t("dashboard.rangeMin", { min: field.min })
                : t("dashboard.rangeMax", { max: field.max! })}
          </p>
        )}
      </div>
    );
  }

  // text
  return (
    <div>
      {labelEl}
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
      />
    </div>
  );
}
