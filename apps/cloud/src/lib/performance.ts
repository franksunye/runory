// ─────────────────────────────────────────────────────────────────────────────
// Runory Field PWA — Web Vitals measurement (v0.5.1 Spec §5.7)
// ─────────────────────────────────────────────────────────────────────────────
//
// Per v0.5.1 Mobile Field-Work Spec §5.7 — Performance Budgets:
//
//   LCP p75                          <= 2.5 s
//   INP p75                          <= 200 ms
//   CLS p75                          <= 0.1
//   mobile-shell initial JS          <= 220 KB gzip
//
// This module wraps the `web-vitals` library so the mobile shell can measure
// real-user LCP, INP, CLS, FCP, and TTFB. It is SSR-safe: every entry point
// guards against a non-browser environment and returns early so the same
// module can be imported by a client component without breaking server render.
//
// Metrics are reported to the browser console (useful during development and
// for installed-PWA diagnostics on /m/account) and, when configured, to an API
// endpoint so aggregate p75 values can be computed for the release report
// required by §5.7 ("Budgets are gates, not marketing claims ...").
// ─────────────────────────────────────────────────────────────────────────────

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

export type WebVitalName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";

export interface PerfMetricReport {
  /** Metric name, e.g. "LCP". */
  name: WebVitalName;
  /** Raw metric value (ms for LCP/INP/FCP/TTFB; unitless for CLS). */
  value: number;
  /** Human-readable rating assigned by web-vitals: "good" | "needs-improvement" | "poor". */
  rating: string;
  /** Unique per-metric id (useful for deduplication when reporting). */
  id: string;
  /** Delta since the last reported value of the same metric (CLS/INP report incrementally). */
  delta: number;
  /** Navigation type that produced the metric. */
  navigationType?: string;
}

export interface PerfReportingOptions {
  /**
   * Optional endpoint to POST metrics to. When omitted, metrics are only
   * logged to the console. Defaults to "/api/web-vitals".
   */
  endpoint?: string;
  /** When true, metrics are printed to the console. Defaults to true. */
  logToConsole?: boolean;
  /** When true, metrics are POSTed to the configured endpoint. Defaults to false. */
  reportToEndpoint?: boolean;
}

/** v0.5.1 Spec §5.7 budgets, used to annotate console output. */
export const PERF_BUDGETS: Record<WebVitalName, { threshold: number; unit: string }> = {
  LCP: { threshold: 2500, unit: "ms" },
  INP: { threshold: 200, unit: "ms" },
  CLS: { threshold: 0.1, unit: "" },
  FCP: { threshold: 1800, unit: "ms" },
  TTFB: { threshold: 800, unit: "ms" },
};

const isBrowser =
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  typeof navigator !== "undefined";

/**
 * Format a metric value for human-readable console output.
 * CLS is a unitless score; timing metrics are rendered in milliseconds.
 */
function formatValue(name: WebVitalName, value: number): string {
  if (name === "CLS") {
    return value.toFixed(3);
  }
  return `${Math.round(value)} ms`;
}

/**
 * Convert a web-vitals Metric into the normalized report shape used internally.
 */
function toReport(metric: Metric): PerfMetricReport {
  return {
    name: metric.name as WebVitalName,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    delta: metric.delta,
    navigationType: metric.navigationType,
  };
}

/**
 * Report a single metric to the console, annotated with the §5.7 budget so a
 * developer running the installed PWA can immediately see pass/fail status.
 */
function logMetric(report: PerfMetricReport): void {
  const budget = PERF_BUDGETS[report.name];
  const valueStr = formatValue(report.name, report.value);
  const budgetStr = budget
    ? `budget ${report.name} <= ${budget.threshold}${budget.unit}`
    : "";
  // eslint-disable-next-line no-console
  console.info(
    `[web-vitals] ${report.name} = ${valueStr} (${report.rating}) — ${budgetStr}`,
  );
}

/**
 * POST a metric report to the configured API endpoint using `navigator.sendBeacon`
 * when available (so it survives page unload), falling back to `fetch`.
 */
function reportToApi(report: PerfMetricReport, endpoint: string): void {
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([JSON.stringify(report)], { type: "application/json" });
    // sendBeacon returns false if the queue is full; ignore the result since
    // metrics are best-effort and must never block the field worker.
    navigator.sendBeacon(endpoint, blob);
    return;
  }
  void fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(report),
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {
    // Reporting failures are non-fatal; the app continues to work.
  });
}

/**
 * Initialize Web Vitals measurement for the mobile shell.
 *
 * Registers callbacks for LCP, INP, CLS, FCP, and TTFB. Each callback converts
 * the raw metric into a normalized report, optionally logs it to the console,
 * and optionally POSTs it to an API endpoint.
 *
 * This function is a no-op on the server and when the `web-vitals` callbacks
 * are unavailable. It is safe to call from a React `useEffect` in a client
 * component.
 *
 * @returns a cleanup function that is currently a no-op (web-vitals registers
 *   listeners that are released on page unload) — returned for API symmetry.
 */
export function initPerformanceMeasurement(
  options: PerfReportingOptions = {},
): () => void {
  if (!isBrowser) {
    return () => {};
  }

  const {
    endpoint = "/api/web-vitals",
    logToConsole = true,
    reportToEndpoint = false,
  } = options;

  const handleMetric = (metric: Metric) => {
    const report = toReport(metric);
    if (logToConsole) {
      logMetric(report);
    }
    if (reportToEndpoint) {
      reportToApi(report, endpoint);
    }
  };

  // Register every metric defined in §5.7 plus FCP/TTFB for diagnostics.
  onLCP(handleMetric);
  onINP(handleMetric);
  onCLS(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);

  return () => {
    // web-vitals attaches observers that auto-disconnect on page unload.
    // There is no public unsubscribe API, so cleanup is intentionally a no-op.
  };
}

export { PERF_BUDGETS as WEB_VITAL_BUDGETS };
