import { describe, expect, it } from "vitest";
import { loadPackManifest } from "./installer";
import { resolveWorkspaceSurfaces } from "./navigation-surfaces";

describe("resolveWorkspaceSurfaces", () => {
  it("keeps a newly-created workspace minimal", () => {
    expect(resolveWorkspaceSurfaces([])).toEqual([]);
  });

  it("only exposes the CRM-wide activity surface for CRM Lite", () => {
    expect(resolveWorkspaceSurfaces([loadPackManifest("crm-lite-pack")])).toEqual(["activity"]);
  });

  it("resolves FSM personal surfaces for an FSM audience", () => {
    expect(resolveWorkspaceSurfaces([loadPackManifest("fsm-pack")], {
      audienceAssignments: [{ packId: "fsm-pack", groupKey: "field_technician" }],
    })).toEqual(["my_work", "planning", "activity"]);
  });

  it("does not leak an audience assignment across Packs with similar role names", () => {
    expect(resolveWorkspaceSurfaces([loadPackManifest("sales-quote-pack")], {
      audienceAssignments: [{ packId: "crm-lite-pack", groupKey: "sales_representative" }],
    })).toEqual(["activity"]);
  });

  it("combines contributions and lets administrators inspect installed capabilities", () => {
    const packs = [loadPackManifest("crm-lite-pack"), loadPackManifest("fsm-pack")];
    expect(resolveWorkspaceSurfaces(packs, { administrator: true })).toEqual([
      "my_work",
      "planning",
      "activity",
    ]);
  });

  it("keeps every catalog Pack manifest compatible with the surface contract", () => {
    for (const packId of [
      "after-sales-pack",
      "ai-visibility-pack",
      "crm-lite-pack",
      "customer-service-pack",
      "fsm-pack",
      "marketing-capture-pack",
      "sales-quote-pack",
      "shared-business-consumer-pack",
    ]) {
      expect(() => loadPackManifest(packId)).not.toThrow();
    }
  });
});
