// ── Operational projection contributions ──
//
// Planning is a platform surface. Packs contribute the presentation resolver
// for subjects they schedule instead of teaching the Planning route about each
// business table. A future installed pack registers another contribution here
// (or through catalog metadata) without changing the API contract.

import { businessTable } from "./contracts";

export interface PlanningSubjectProjection {
  subjectType: string;
  table: string;
  titleColumn: string;
  statusColumn?: string;
  statusMap?: Record<string, "scheduled" | "in_progress" | "completed" | "cancelled">;
}

const planningSubjects = new Map<string, PlanningSubjectProjection>();

export function registerPlanningSubjectProjection(projection: PlanningSubjectProjection): void {
  planningSubjects.set(projection.subjectType, projection);
}

export function getPlanningSubjectProjection(subjectType: string): PlanningSubjectProjection | undefined {
  return planningSubjects.get(subjectType);
}

// FSM's two initial contributors. The platform route only consumes this
// registry; packs can extend it without a route-level switch statement.
registerPlanningSubjectProjection({
  subjectType: "work_order",
  table: businessTable("work_order"),
  titleColumn: "title",
  statusColumn: "status",
  statusMap: {
    in_progress: "in_progress",
    blocked: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
  },
});
registerPlanningSubjectProjection({
  subjectType: "service_visit",
  table: businessTable("service_visit"),
  titleColumn: "title",
  statusColumn: "status",
  statusMap: {
    en_route: "in_progress",
    on_site: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
  },
});
