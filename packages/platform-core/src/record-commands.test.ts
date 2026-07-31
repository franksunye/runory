import { describe, expect, it } from "vitest";
import { commandContractSchema } from "@runory/contracts";
import { loadModuleManifest } from "./installer";

/**
 * Availability is pure once the Contracts and the record are in hand. These
 * cases lock the declared semantics of the four Modules without standing up a
 * Workspace. The async Workspace path uses the same rules against the
 * provisioned Contract snapshots.
 */

type Predicate = {
  field: string;
  operator: "equals" | "not_equals" | "not_null" | "is_null";
  value?: string | number | boolean;
};

function satisfies(predicates: Predicate[], record: Record<string, unknown>): boolean {
  return predicates.every((predicate) => {
    const value = record[predicate.field];
    switch (predicate.operator) {
      case "not_null":
        return value !== null && value !== undefined && value !== "";
      case "is_null":
        return value === null || value === undefined || value === "";
      case "equals":
        return typeof predicate.value === "number"
          ? Number(value) === predicate.value
          : String(value) === String(predicate.value);
      case "not_equals":
        return typeof predicate.value === "number"
          ? Number(value) !== predicate.value
          : String(value) !== String(predicate.value);
    }
  });
}

function availableKeys(
  moduleId: string,
  objectKey: string,
  record: Record<string, unknown>,
): string[] {
  const status = String(record.status ?? "");
  const contracts = (loadModuleManifest(moduleId).domain?.commands ?? [])
    .map((command) => commandContractSchema.parse(command))
    .filter((contract) => contract.intent);

  return contracts
    .filter((contract) => {
      if (contract.initiatedFrom) {
        return contract.initiatedFrom.aggregate === objectKey
          && satisfies(contract.initiatedFrom.when as Predicate[], record);
      }
      if (contract.aggregate !== objectKey) return false;
      if (!satisfies(contract.availableWhen as Predicate[], record)) return false;
      if (!contract.transition) return true;
      return contract.transition.from.includes(status);
    })
    .map((contract) => contract.key)
    .sort();
}

describe("Record command surface (manifest-derived)", () => {
  it("offers the expected next step for a new Work Order", () => {
    expect(availableKeys("runory.work-order", "work_order", {
      id: "wo_1",
      status: "new",
    })).toEqual([
      "work_order.block",
      "work_order.cancel",
      "work_order.triage",
    ]);
  });

  it("offers Plan & dispatch and the escape hatches once triaged", () => {
    expect(availableKeys("runory.work-order", "work_order", {
      id: "wo_1",
      status: "triaged",
    })).toEqual([
      "work_order.block",
      "work_order.cancel",
      "work_order.create_visit",
    ]);
  });

  it("keeps create_visit available after the first visit is planned", () => {
    expect(availableKeys("runory.work-order", "work_order", {
      id: "wo_1",
      status: "planned",
    })).toEqual([
      "work_order.block",
      "work_order.cancel",
      "work_order.create_visit",
      "work_order.start",
    ]);
  });

  it("offers Issue invoice from a completed, quote-sourced Work Order", () => {
    expect(availableKeys("runory.invoice", "work_order", {
      id: "wo_1",
      status: "completed",
      source_type: "quote",
    })).toEqual(["invoice.issue_from_work_order"]);
  });

  it("hides Issue invoice when the Work Order was not converted from a Quote", () => {
    expect(availableKeys("runory.invoice", "work_order", {
      id: "wo_1",
      status: "completed",
      source_type: "manual",
    })).toEqual([]);
  });

  it("offers the review decisions for a Quote in review", () => {
    expect(availableKeys("runory.quote", "quote", {
      id: "q_1",
      status: "in_review",
    })).toEqual([
      "quote.approve",
      "quote.reject",
      "quote.return_for_changes",
      "quote.withdraw",
    ]);
  });

  it("offers Convert once a Quote is accepted", () => {
    expect(availableKeys("runory.quote", "quote", {
      id: "q_1",
      status: "accepted",
    })).toEqual(["quote.convert_to_work_order"]);
  });

  it("includes submit_work for an on-site Visit (the previous mobile drift)", () => {
    expect(availableKeys("runory.service-visit", "service_visit", {
      id: "sv_1",
      status: "on_site",
    })).toEqual([
      "visit.cancel",
      "visit.complete",
      "visit.submit_work",
    ]);
  });

  it("refuses to void an Invoice that has already taken money", () => {
    expect(availableKeys("runory.invoice", "invoice", {
      id: "inv_1",
      status: "issued",
      amount_paid_minor: 100,
    })).toEqual([]);
  });

  it("offers Void for an unpaid issued Invoice", () => {
    expect(availableKeys("runory.invoice", "invoice", {
      id: "inv_1",
      status: "issued",
      amount_paid_minor: 0,
    })).toEqual(["invoice.void"]);
  });

  it("declares an icon token on every surfaced command", () => {
    const modules = [
      "runory.work-order",
      "runory.quote",
      "runory.service-visit",
      "runory.invoice",
    ] as const;
    for (const moduleId of modules) {
      for (const command of loadModuleManifest(moduleId).domain?.commands ?? []) {
        if (!command.intent) continue;
        expect(command.icon, `${command.key} needs an icon token`).toBeTruthy();
      }
    }
  });
});
