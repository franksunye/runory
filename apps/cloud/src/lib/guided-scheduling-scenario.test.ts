import { describe, expect, it } from "vitest";
import {
  guidedSchedulingScenario,
  slotsOverlap,
  validateGuidedSchedulingScenario,
} from "./guided-scheduling-scenario";

describe("guided scheduling scenario", () => {
  it("stays internally consistent with the represented FSM constraints", () => {
    expect(validateGuidedSchedulingScenario(guidedSchedulingScenario)).toEqual([]);
  });

  it("starts with a conflict and ends in a conflict-free slot", () => {
    const david = guidedSchedulingScenario.candidates.find((candidate) => candidate.id === "tech-david");
    expect(david?.existingVisit).toBeDefined();
    expect(slotsOverlap(guidedSchedulingScenario.originalSlot, david!.existingVisit!)).toBe(true);
    expect(slotsOverlap(guidedSchedulingScenario.resolvedSlot, david!.existingVisit!)).toBe(false);
  });

  it("uses only named commands permitted for the dispatcher", () => {
    expect(guidedSchedulingScenario.commands).toEqual(["assignment.propose", "schedule.plan"]);
    expect(guidedSchedulingScenario.actor.permissions).toEqual(
      expect.arrayContaining(["assignment.manage", "schedule.manage"])
    );
  });
});
