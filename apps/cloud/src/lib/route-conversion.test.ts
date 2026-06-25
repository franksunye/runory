import { describe, it, expect } from "vitest";
import {
  segmentToObjectKey,
  objectKeyToRouteSegment,
  objectKeyToTitle,
} from "./route-conversion";

describe("segmentToObjectKey", () => {
  // v0.4.0 acceptance: all canonical CRM/FSM objects must resolve correctly
  const cases: Array<[segment: string, expected: string]> = [
    ["companies", "company"],
    ["contacts", "contact"],
    ["deals", "deal"],
    ["tasks", "task"],
    ["work-orders", "work_order"],
    ["service-sites", "service_site"],
    ["assets", "asset"],
    ["service-visits", "service_visit"],
    ["service-reports", "service_report"],
    ["technicians", "technician"],
    // Additional objects from packs
    ["tickets", "ticket"],
    ["quotes", "quote"],
    ["quote-lines", "quote_line"],
    ["warranties", "warranty"],
    ["repair-requests", "repair_request"],
    ["return-requests", "return_request"],
    ["maintenance-plans", "maintenance_plan"],
    ["campaigns", "campaign"],
    ["landing-pages", "landing_page"],
    ["submissions", "submission"],
    ["forms", "form"],
    ["conversations", "conversation"],
    ["consents", "consent"],
  ];

  it.each(cases)("segmentToObjectKey(%s) → %s", (segment, expected) => {
    expect(segmentToObjectKey(segment)).toBe(expected);
  });

  it("handles single-token segments without hyphens", () => {
    expect(segmentToObjectKey("companies")).toBe("company");
    expect(segmentToObjectKey("assets")).toBe("asset");
  });

  it("handles multi-word segments with hyphens", () => {
    expect(segmentToObjectKey("service-sites")).toBe("service_site");
    expect(segmentToObjectKey("work-orders")).toBe("work_order");
  });

  it("handles 'ies' pluralization (company → companies)", () => {
    expect(segmentToObjectKey("companies")).toBe("company");
    expect(segmentToObjectKey("warranties")).toBe("warranty");
  });

  it("handles 'ses' pluralization (status → statuses)", () => {
    expect(segmentToObjectKey("statuses")).toBe("status");
  });

  it("handles simple 's' pluralization", () => {
    expect(segmentToObjectKey("contacts")).toBe("contact");
    expect(segmentToObjectKey("technicians")).toBe("technician");
  });

  it("handles already-singular segments (no plural suffix)", () => {
    // Words that don't end in s/ies/ses pass through unchanged
    expect(segmentToObjectKey("deal")).toBe("deal");
    expect(segmentToObjectKey("child")).toBe("child");
  });
});

describe("objectKeyToRouteSegment", () => {
  const cases: Array<[objectKey: string, expected: string]> = [
    ["company", "companies"],
    ["contact", "contacts"],
    ["deal", "deals"],
    ["task", "tasks"],
    ["work_order", "work-orders"],
    ["service_site", "service-sites"],
    ["asset", "assets"],
    ["service_visit", "service-visits"],
    ["service_report", "service-reports"],
    ["technician", "technicians"],
    ["ticket", "tickets"],
    ["quote", "quotes"],
    ["quote_line", "quote-lines"],
    ["warranty", "warranties"],
    ["repair_request", "repair-requests"],
    ["return_request", "return-requests"],
    ["maintenance_plan", "maintenance-plans"],
    ["campaign", "campaigns"],
    ["landing_page", "landing-pages"],
    ["submission", "submissions"],
    ["form", "forms"],
    ["conversation", "conversations"],
    ["consent", "consents"],
  ];

  it.each(cases)("objectKeyToRouteSegment(%s) → %s", (objectKey, expected) => {
    expect(objectKeyToRouteSegment(objectKey)).toBe(expected);
  });

  it("handles 'y' → 'ies' pluralization", () => {
    expect(objectKeyToRouteSegment("company")).toBe("companies");
    expect(objectKeyToRouteSegment("warranty")).toBe("warranties");
  });

  it("handles 's' ending → 'es' pluralization", () => {
    expect(objectKeyToRouteSegment("status")).toBe("statuses");
  });

  it("handles simple '+s' pluralization", () => {
    expect(objectKeyToRouteSegment("contact")).toBe("contacts");
    expect(objectKeyToRouteSegment("technician")).toBe("technicians");
  });
});

describe("bidirectional conversion (round-trip)", () => {
  // v0.4.0 acceptance: segmentToObjectKey and objectKeyToRouteSegment must be inverses
  const canonicalObjects = [
    "company",
    "contact",
    "deal",
    "task",
    "work_order",
    "service_site",
    "asset",
    "service_visit",
    "service_report",
    "technician",
    "ticket",
    "quote",
    "quote_line",
    "warranty",
    "repair_request",
    "return_request",
    "maintenance_plan",
    "campaign",
    "landing_page",
    "submission",
    "form",
    "conversation",
    "consent",
  ];

  it.each(canonicalObjects)(
    "objectKeyToRouteSegment(%s) → segmentToObjectKey(...) === %s",
    (objectKey) => {
      const segment = objectKeyToRouteSegment(objectKey);
      const roundTripped = segmentToObjectKey(segment);
      expect(roundTripped).toBe(objectKey);
    },
  );

  it.each(canonicalObjects)(
    "segmentToObjectKey(%s via route) → objectKeyToRouteSegment(...) === original segment",
    (objectKey) => {
      const originalSegment = objectKeyToRouteSegment(objectKey);
      const roundTrippedKey = segmentToObjectKey(originalSegment);
      const roundTrippedSegment = objectKeyToRouteSegment(roundTrippedKey);
      expect(roundTrippedSegment).toBe(originalSegment);
    },
  );
});

describe("objectKeyToTitle", () => {
  const cases: Array<[objectKey: string, expected: string]> = [
    ["company", "Company"],
    ["service_site", "Service Site"],
    ["work_order", "Work Order"],
    ["service_visit", "Service Visit"],
    ["service_report", "Service Report"],
    ["repair_request", "Repair Request"],
    ["return_request", "Return Request"],
    ["maintenance_plan", "Maintenance Plan"],
    ["landing_page", "Landing Page"],
    ["quote_line", "Quote Line"],
  ];

  it.each(cases)("objectKeyToTitle(%s) → %s", (objectKey, expected) => {
    expect(objectKeyToTitle(objectKey)).toBe(expected);
  });

  it("capitalizes each word separated by underscore", () => {
    expect(objectKeyToTitle("contact")).toBe("Contact");
    expect(objectKeyToTitle("asset")).toBe("Asset");
  });
});
