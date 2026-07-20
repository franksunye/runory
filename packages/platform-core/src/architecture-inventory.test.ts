import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertArchitectureInventory,
  buildArchitectureInventory,
  COMMAND_IMPLEMENTATIONS,
} from "./architecture-inventory";

const COMMAND_SOURCE_FIXTURE = {
  "module:runory.invoice@1.0.0": [
    "invoice.issue_from_work_order",
    "invoice.void",
  ],
  "module:runory.payment@0.2.0": [
    "payment.confirm_provider_result",
    "payment.confirm_refund",
    "payment.expire_request",
    "payment.fail_provider_result",
    "payment.fail_refund",
    "payment.request",
    "payment.request_refund",
  ],
  "module:runory.quote@1.1.0": [
    "quote.accept",
    "quote.approve",
    "quote.convert_to_work_order",
    "quote.create_draft",
    "quote.create_revision",
    "quote.expire",
    "quote.mark_declined",
    "quote.mark_sent",
    "quote.recalculate",
    "quote.reject",
    "quote.return_for_changes",
    "quote.submit_for_approval",
    "quote.withdraw",
  ],
  "module:runory.service-visit@1.1.0": [
    "visit.arrive",
    "visit.cancel",
    "visit.complete",
    "visit.start_travel",
    "visit.submit_work",
  ],
  "module:runory.work-order@1.1.0": [
    "work_order.block",
    "work_order.cancel",
    "work_order.complete",
    "work_order.create_visit",
    "work_order.reopen",
    "work_order.start",
    "work_order.triage",
    "work_order.unblock",
  ],
  "platform_service:runory.forms@1.0.0": [
    "form_submission.accept",
    "form_submission.return",
    "form_submission.revise",
    "form_submission.save_draft",
    "form_submission.submit",
  ],
  "platform_service:runory.workflow@1.0.0": [
    "approval.decide",
    "work_item.cancel",
    "work_item.claim",
    "work_item.complete",
    "work_item.release",
    "work_item.return",
  ],
} as const;

describe("Command architecture inventory", () => {
  it("proves every callable Command has exactly one provisionable Contract and Provider closure", () => {
    const inventory = assertArchitectureInventory();

    expect(inventory.issues).toEqual([]);
    expect(inventory.summary).toMatchObject({
      commandCount: 46,
      sourceCount: 7,
      moduleSourceCount: 5,
      platformServiceSourceCount: 2,
      providerCount: 15,
    });
  });

  it("preserves the accepted Contract source and version fixture", () => {
    const inventory = buildArchitectureInventory();
    const actual = Object.fromEntries(inventory.sources.map((source) => [
      `${source.kind}:${source.id}@${source.version}`,
      source.commandKeys,
    ]));

    expect(actual).toEqual(COMMAND_SOURCE_FIXTURE);
  });

  it("keeps implementation declarations aligned with literal executeCommand call sites", () => {
    const byFile = new Map<string, string[]>();
    for (const declaration of COMMAND_IMPLEMENTATIONS) {
      const existing = byFile.get(declaration.sourceFile) ?? [];
      existing.push(declaration.key);
      byFile.set(declaration.sourceFile, existing);
    }

    for (const [sourceFile, declaredKeys] of byFile) {
      const source = readFileSync(resolve(import.meta.dirname, sourceFile), "utf8");
      const actualKeys = [...source.matchAll(/commandType:\s*["`]([^"`]+)["`]/g)]
        .map((match) => match[1])
        .sort();
      expect(actualKeys, sourceFile).toEqual([...declaredKeys].sort());
    }
  });
});
