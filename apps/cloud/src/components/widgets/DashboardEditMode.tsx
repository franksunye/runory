"use client";

import { useState, useCallback } from "react";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, X, Settings2,
} from "lucide-react";
import type { WidgetDeclaration, DashboardZone } from "@runory/contracts";

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

// ── Main Component ──

export default function DashboardEditMode({
  workspaceId,
  layout,
  availableWidgets,
  zones,
  onLayoutChange,
  onReset,
  onClose,
}: DashboardEditModeProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState<DashboardZone | false>(false);

  const saveUpdates = useCallback(async (updates: Array<{
    zone: DashboardZone;
    widgetModule: string;
    widgetKey: string;
    widgetInstance: string;
    position?: number;
    hidden?: boolean;
  }>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/dashboard/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "保存失败");
      onLayoutChange(json.data.layout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [workspaceId, onLayoutChange]);

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
      const res = await fetch(`/api/workspaces/${workspaceId}/dashboard/layout`, {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "重置失败");
      onLayoutChange(json.data.layout);
      onReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重置失败");
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

  const zoneLabels: Record<DashboardZone, string> = {
    metrics: "指标卡",
    trends: "趋势图",
    lists: "列表",
    activity: "动态",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-indigo-600" />
          <span className="text-sm font-medium text-indigo-900">编辑模式</span>
          {saving && <span className="text-xs text-indigo-500">保存中...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleReset()}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
          >
            重置默认
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <X size={14} />完成
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
              <h3 className="text-sm font-bold text-slate-900">{zoneLabels[zone]}</h3>
              <button
                onClick={() => setShowAddPanel(showAddPanel === zone ? false : zone)}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Plus size={12} />添加组件
              </button>
            </div>

            {items.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">此区域暂无组件</p>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={`${item.moduleId}:${item.widgetKey}:${item.instance}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{item.widget.label}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {item.widget.type}
                      </span>
                      {item.hidden && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">已隐藏</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMove(item, "up")}
                        disabled={index === 0 || saving}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        title="上移"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => handleMove(item, "down")}
                        disabled={index === items.length - 1 || saving}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        title="下移"
                      >
                        <ArrowDown size={14} />
                      </button>
                      {item.hidden ? (
                        <button
                          onClick={() => handleShow(item)}
                          disabled={saving}
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                          title="显示"
                        >
                          <Eye size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleHide(item)}
                          disabled={saving}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="隐藏"
                        >
                          <EyeOff size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Panel */}
            {showAddPanel === zone && (
              <div className="mt-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-600">可添加的组件：</p>
                {addableWidgets.length === 0 ? (
                  <p className="text-xs text-slate-400">所有可用组件已在此工作台</p>
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
                          <Plus size={12} />添加
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
