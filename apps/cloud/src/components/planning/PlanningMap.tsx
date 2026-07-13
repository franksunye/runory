"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanningEntry } from "@/lib/api-hooks";

const OPEN_FREE_MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

interface PlanningMapProps {
  entries: PlanningEntry[];
  onSelect: (entry: PlanningEntry) => void;
  loadErrorLabel: string;
}

/** Interactive MapLibre map for geolocated planning entries. */
export function PlanningMap({ entries, onSelect, loadErrorLabel }: PlanningMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || entries.length === 0) return;

    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    let loadTimer: number | undefined;

    void (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed) return;

        const coordinates = entries.map((entry) => [entry.longitude as number, entry.latitude as number] as [number, number]);
        const createdMap = new maplibregl.Map({
          container,
          style: OPEN_FREE_MAP_STYLE,
          center: coordinates[0],
          zoom: 11,
        });
        map = createdMap;
        createdMap.addControl(new maplibregl.NavigationControl(), "top-right");
        loadTimer = window.setTimeout(() => {
          if (!disposed) setMapError(true);
        }, 10_000);

        createdMap.on("load", () => {
          if (disposed) return;
          if (loadTimer) window.clearTimeout(loadTimer);

          if (coordinates.length > 1) {
            const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
            for (const coordinate of coordinates.slice(1)) bounds.extend(coordinate);
            createdMap.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 0 });
          }

          createdMap.addSource("planning-entries", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: entries.map((entry) => ({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [entry.longitude as number, entry.latitude as number],
                },
                properties: { id: entry.id, status: entry.status },
              })),
            },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 48,
          });
          createdMap.addLayer({
            id: "planning-entry-clusters",
            type: "circle",
            source: "planning-entries",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#4f46e5",
              "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            },
          });
          createdMap.addLayer({
            id: "planning-entry-cluster-count",
            type: "symbol",
            source: "planning-entries",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
          });
          createdMap.addLayer({
            id: "planning-entry-unclustered",
            type: "circle",
            source: "planning-entries",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "match",
                ["get", "status"],
                "completed", "#94a3b8",
                "cancelled", "#ef4444",
                "in_progress", "#22c55e",
                "#3b82f6",
              ],
              "circle-radius": 9,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            },
          });
          createdMap.on("click", "planning-entry-clusters", (event) => {
            const clusterId = event.features?.[0]?.properties?.cluster_id;
            const source = createdMap.getSource("planning-entries") as import("maplibre-gl").GeoJSONSource;
            if (typeof clusterId !== "number") return;
            void source.getClusterExpansionZoom(clusterId).then((zoom) => {
              createdMap.easeTo({ center: event.lngLat, zoom });
            });
          });
          createdMap.on("click", "planning-entry-unclustered", (event) => {
            const entryId = event.features?.[0]?.properties?.id;
            const entry = entries.find((candidate) => candidate.id === entryId);
            if (entry) onSelect(entry);
          });
          for (const layerId of ["planning-entry-clusters", "planning-entry-unclustered"]) {
            createdMap.on("mouseenter", layerId, () => {
              createdMap.getCanvas().style.cursor = "pointer";
            });
            createdMap.on("mouseleave", layerId, () => {
              createdMap.getCanvas().style.cursor = "";
            });
          }
        });

      } catch {
        if (!disposed) setMapError(true);
      }
    })();

    return () => {
      disposed = true;
      if (loadTimer) window.clearTimeout(loadTimer);
      map?.remove();
    };
  }, [entries, onSelect]);

  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      {mapError && (
        <div className="absolute inset-4 overflow-auto rounded-xl border border-red-200 bg-white/95 p-4 shadow-sm">
          <p className="text-sm font-medium text-red-700">{loadErrorLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelect(entry)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-300"
              >
                {entry.subject_name ?? entry.subject_id?.slice(0, 8) ?? entry.id.slice(0, 8)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
