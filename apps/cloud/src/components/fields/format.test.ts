import { describe, it, expect } from "vitest";
import {
  intlLocale,
  parseDate,
  formatDateValue,
  formatNumberValue,
  formatBooleanLabel,
  initials,
  resolveDisplayLabel,
  humanizeSelectValue,
} from "./format";

// ── intlLocale ──

describe("intlLocale", () => {
  it("maps 'zh' to 'zh-CN'", () => {
    expect(intlLocale("zh")).toBe("zh-CN");
  });

  it("maps 'en' to 'en-US'", () => {
    expect(intlLocale("en")).toBe("en-US");
  });

  it("falls back to 'en-US' for unknown locales", () => {
    expect(intlLocale("fr")).toBe("en-US");
    expect(intlLocale("")).toBe("en-US");
  });
});

// ── parseDate ──

describe("parseDate", () => {
  it("parses date-only strings in local time", () => {
    const result = parseDate("2026-07-28");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(6); // July = 6
    expect(result!.getDate()).toBe(28);
  });

  it("parses full ISO strings", () => {
    const result = parseDate("2026-07-28T15:30:00Z");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
  });

  it("returns null for invalid date strings", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("returns null for strings that don't match the date pattern", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("invalid")).toBeNull();
  });
});

// ── formatDateValue ──

describe("formatDateValue", () => {
  it("returns null for empty values", () => {
    expect(formatDateValue(null, "en")).toBeNull();
    expect(formatDateValue(undefined, "en")).toBeNull();
    expect(formatDateValue("", "en")).toBeNull();
  });

  it("formats a date-only string for English locale", () => {
    const result = formatDateValue("2026-07-28", "en");
    expect(result).not.toBeNull();
    expect(result).toContain("2026");
    expect(result).toContain("28");
  });

  it("formats a date-only string for Chinese locale", () => {
    const result = formatDateValue("2026-07-28", "zh");
    expect(result).not.toBeNull();
    expect(result).toContain("2026");
  });

  it("returns the raw string for invalid dates", () => {
    expect(formatDateValue("not-a-date", "en")).toBe("not-a-date");
  });
});

// ── formatNumberValue ──

describe("formatNumberValue", () => {
  it("returns null for empty values", () => {
    expect(formatNumberValue(null, "en")).toBeNull();
    expect(formatNumberValue(undefined, "en")).toBeNull();
    expect(formatNumberValue("", "en")).toBeNull();
  });

  it("formats integer numbers for English locale", () => {
    const result = formatNumberValue(1234567, "en");
    expect(result).toBe("1,234,567");
  });

  it("formats decimal numbers for English locale", () => {
    const result = formatNumberValue(1234.56, "en");
    expect(result).toBe("1,234.56");
  });

  it("formats numbers for Chinese locale", () => {
    const result = formatNumberValue(1234567, "zh");
    expect(result).toBe("1,234,567");
  });

  it("formats numeric strings", () => {
    const result = formatNumberValue("12345", "en");
    expect(result).toBe("12,345");
  });

  it("returns the raw string for non-numeric input", () => {
    expect(formatNumberValue("abc", "en")).toBe("abc");
    expect(formatNumberValue(NaN, "en")).toBe("NaN");
  });
});

// ── formatBooleanLabel ──

describe("formatBooleanLabel", () => {
  it("returns null for null/undefined", () => {
    expect(formatBooleanLabel(null, "en")).toBeNull();
    expect(formatBooleanLabel(undefined, "en")).toBeNull();
  });

  it("returns 'Yes' for true in English", () => {
    expect(formatBooleanLabel(true, "en")).toBe("Yes");
  });

  it("returns 'No' for false in English", () => {
    expect(formatBooleanLabel(false, "en")).toBe("No");
  });

  it("returns '是' for true in Chinese", () => {
    expect(formatBooleanLabel(true, "zh")).toBe("是");
  });

  it("returns '否' for false in Chinese", () => {
    expect(formatBooleanLabel(false, "zh")).toBe("否");
  });

  it("coerces truthy/falsy values", () => {
    expect(formatBooleanLabel(1, "en")).toBe("Yes");
    expect(formatBooleanLabel(0, "en")).toBe("No");
  });
});

// ── initials ──

describe("initials", () => {
  it("returns '?' for empty string", () => {
    expect(initials("")).toBe("?");
  });

  it("returns '?' for whitespace-only string", () => {
    expect(initials("   ")).toBe("?");
  });

  it("returns first letter for single-word name", () => {
    expect(initials("Alice")).toBe("A");
  });

  it("returns first and last initials for two-word name", () => {
    expect(initials("Alice Smith")).toBe("AS");
  });

  it("returns first and last initials for multi-word name", () => {
    expect(initials("Alice Marie Smith")).toBe("AS");
  });

  it("uppercases initials", () => {
    expect(initials("alice smith")).toBe("AS");
  });
});

// ── resolveDisplayLabel ──

describe("resolveDisplayLabel", () => {
  it("returns null for null value with no displayValue", () => {
    expect(resolveDisplayLabel(null)).toBeNull();
  });

  it("returns null for undefined value with no displayValue", () => {
    expect(resolveDisplayLabel(undefined)).toBeNull();
  });

  it("returns null for empty string value with no displayValue", () => {
    expect(resolveDisplayLabel("")).toBeNull();
  });

  it("returns the displayValue when provided", () => {
    expect(resolveDisplayLabel("raw-id", "Display Name")).toBe("Display Name");
  });

  it("falls back to stringified value when no displayValue", () => {
    expect(resolveDisplayLabel("raw-id")).toBe("raw-id");
    expect(resolveDisplayLabel(12345)).toBe("12345");
  });

  it("returns null when displayValue is empty string", () => {
    expect(resolveDisplayLabel("", "")).toBeNull();
  });

  it("prefers displayValue over value even when value is non-empty", () => {
    expect(resolveDisplayLabel("uuid-123", "Acme Corp")).toBe("Acme Corp");
  });
});

describe("humanizeSelectValue", () => {
  it("turns machine select values into business labels", () => {
    expect(humanizeSelectValue("marketing_qualified")).toBe("Marketing qualified");
    expect(humanizeSelectValue("in-progress")).toBe("In progress");
  });
});
