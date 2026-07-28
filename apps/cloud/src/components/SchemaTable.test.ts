import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRelativeTime } from "./SchemaTable";

// Mock i18n t-function for deterministic output
const mockT = (key: string, params?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    "workspace.table.justNow": "Just now",
    "workspace.table.minutesAgo": `${params?.min ?? 0} min ago`,
    "workspace.table.hoursAgo": `${params?.hr ?? 0} hr ago`,
    "workspace.table.daysAgo": `${params?.day ?? 0} d ago`,
    "workspace.table.monthsAgo": `${params?.month ?? 0} mo ago`,
    "workspace.table.yearsAgo": `${params?.years ?? 0} yr ago`,
  };
  return map[key] ?? key;
};

describe("formatRelativeTime", () => {
  beforeEach(() => {
    // Fix the clock at 2026-07-28T12:00:00Z for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns em dash for null values", () => {
    expect(formatRelativeTime(null)).toBe("—");
  });

  it("returns em dash for undefined values", () => {
    expect(formatRelativeTime(undefined)).toBe("—");
  });

  it("returns em dash for empty string", () => {
    expect(formatRelativeTime("")).toBe("—");
  });

  it("returns the raw value for invalid date strings", () => {
    expect(formatRelativeTime("not-a-date")).toBe("not-a-date");
  });

  it("returns 'Just now' for timestamps less than 60 seconds ago", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now, mockT)).toBe("Just now");
  });

  it("returns 'X min ago' for timestamps within the last hour", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, mockT)).toBe("5 min ago");
  });

  it("returns 'X hr ago' for timestamps within the last day", () => {
    const threeHrAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHrAgo, mockT)).toBe("3 hr ago");
  });

  it("returns 'X d ago' for timestamps within the last 30 days", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveDaysAgo, mockT)).toBe("5 d ago");
  });

  it("returns 'X mo ago' for timestamps within the last year", () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeMonthsAgo, mockT)).toBe("3 mo ago");
  });

  it("returns 'X yr ago' for timestamps older than a year", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoYearsAgo, mockT)).toBe("2 yr ago");
  });

  it("uses English fallback strings when t-function is not provided", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("5 min ago");
  });
});
