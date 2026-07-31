import { describe, expect, it } from "vitest";
import {
  formatMinorAmount,
  majorToMinor,
  minorToMajor,
  recordDisplayName,
} from "./money";

describe("money helpers", () => {
  it("converts major and minor units without float drift on cents", () => {
    expect(majorToMinor(300)).toBe(30_000);
    expect(majorToMinor(12.5)).toBe(1_250);
    expect(minorToMajor(30_000)).toBe(300);
    expect(minorToMajor(1_250)).toBe(12.5);
  });

  it("formats minor amounts with Intl currency", () => {
    expect(formatMinorAmount(30_000, "USD", "en-US")).toContain("300");
  });

  it("prefers business identity fields over fallback", () => {
    expect(recordDisplayName({ title: "HVAC repair" }, "Work Order")).toBe("HVAC repair");
    expect(recordDisplayName({ quote_number: "Q-1" }, "Quote")).toBe("Q-1");
    expect(recordDisplayName({}, "Invoice")).toBe("Invoice");
  });
});
