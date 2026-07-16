export type GuidedCandidate = {
  id: string;
  name: string;
  initials: string;
  skills: readonly string[];
  region: string;
  availability: "available" | "busy";
  existingVisit?: {
    title: string;
    start: string;
    end: string;
  };
  match: "recommended" | "unavailable" | "out_of_region";
};

export type GuidedSchedulingScenario = {
  actor: {
    name: string;
    role: "dispatcher";
    permissions: readonly string[];
  };
  workOrder: {
    id: string;
    title: string;
    priority: "urgent";
    customer: string;
    site: string;
    region: string;
    requiredSkill: string;
    slaDue: string;
  };
  candidates: readonly GuidedCandidate[];
  originalSlot: { start: string; end: string };
  resolvedSlot: { start: string; end: string };
  commands: readonly ["assignment.propose", "schedule.plan"];
  receipt: {
    id: string;
    auditId: string;
    status: "guided_completed";
  };
};

export const guidedSchedulingScenario: GuidedSchedulingScenario = {
  actor: {
    name: "Sarah Chen",
    role: "dispatcher",
    permissions: ["work_order.read", "assignment.manage", "schedule.manage"],
  },
  workOrder: {
    id: "wo-acme-hvac-urgent",
    title: "Acme HVAC emergency repair",
    priority: "urgent",
    customer: "Acme",
    site: "Acme HQ · San Francisco",
    region: "San Francisco Bay Area",
    requiredSkill: "HVAC",
    slaDue: "Tomorrow · 17:00",
  },
  candidates: [
    {
      id: "tech-david",
      name: "David Park",
      initials: "DP",
      skills: ["HVAC", "Electrical", "Plumbing"],
      region: "San Francisco Bay Area",
      availability: "available",
      existingVisit: {
        title: "Warehouse HVAC service",
        start: "10:00",
        end: "12:00",
      },
      match: "recommended",
    },
    {
      id: "tech-maria",
      name: "Maria Garcia",
      initials: "MG",
      skills: ["Network", "Server Hardware", "Cabling"],
      region: "San Francisco Bay Area",
      availability: "busy",
      match: "unavailable",
    },
    {
      id: "tech-james",
      name: "James Wilson",
      initials: "JW",
      skills: ["Refrigeration", "Kitchen Equipment"],
      region: "New York Metro",
      availability: "available",
      match: "out_of_region",
    },
  ],
  originalSlot: { start: "10:00", end: "12:00" },
  resolvedSlot: { start: "13:30", end: "15:30" },
  commands: ["assignment.propose", "schedule.plan"],
  receipt: {
    id: "guided_run_001",
    auditId: "guided_audit_001",
    status: "guided_completed",
  },
};

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function slotsOverlap(
  left: { start: string; end: string },
  right: { start: string; end: string }
): boolean {
  return toMinutes(left.start) < toMinutes(right.end)
    && toMinutes(right.start) < toMinutes(left.end);
}

export function validateGuidedSchedulingScenario(
  scenario: GuidedSchedulingScenario
): string[] {
  const errors: string[] = [];
  const recommended = scenario.candidates.filter((candidate) => candidate.match === "recommended");

  if (recommended.length !== 1) errors.push("Scenario must have exactly one recommended technician");

  const candidate = recommended[0];
  if (!candidate) return errors;

  if (!candidate.skills.includes(scenario.workOrder.requiredSkill)) {
    errors.push("Recommended technician must have the required skill");
  }
  if (candidate.region !== scenario.workOrder.region) {
    errors.push("Recommended technician must match the service region");
  }
  if (candidate.availability !== "available") {
    errors.push("Recommended technician must be available");
  }
  if (!candidate.existingVisit || !slotsOverlap(scenario.originalSlot, candidate.existingVisit)) {
    errors.push("Original slot must demonstrate a real schedule conflict");
  }
  if (candidate.existingVisit && slotsOverlap(scenario.resolvedSlot, candidate.existingVisit)) {
    errors.push("Resolved slot must clear the schedule conflict");
  }
  if (!scenario.actor.permissions.includes("assignment.manage")) {
    errors.push("Actor must be permitted to manage assignments");
  }
  if (!scenario.actor.permissions.includes("schedule.manage")) {
    errors.push("Actor must be permitted to manage schedules");
  }

  return errors;
}
