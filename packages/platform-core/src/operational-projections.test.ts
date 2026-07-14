import { describe, expect, it } from "vitest";
import { getPlanningSubjectProjection } from "./operational-projections";

describe("Planning subject status projections", () => {
  it("projects a completed service visit as completed independently of its schedule lifecycle", () => {
    const projection = getPlanningSubjectProjection("service_visit");

    expect(projection?.statusColumn).toBe("status");
    expect(projection?.statusMap?.completed).toBe("completed");
    expect(projection?.statusMap?.on_site).toBe("in_progress");
  });

  it("projects terminal work order states for Planning consumers", () => {
    const projection = getPlanningSubjectProjection("work_order");

    expect(projection?.statusMap?.completed).toBe("completed");
    expect(projection?.statusMap?.cancelled).toBe("cancelled");
  });
});
