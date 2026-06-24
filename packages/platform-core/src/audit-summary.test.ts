import { describe, expect, it } from "vitest";
import { renderAuditSummary, type AuditEvent } from "./audit-service";

function makeEvent(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id: "aud_test",
    workspaceId: "ws_test",
    actorType: "user",
    actorId: "usr_abc123",
    action: "record.create",
    entityType: "company",
    entityId: "rec_test",
    before: null,
    after: null,
    extensionVersionId: null,
    requestId: null,
    createdAt: "2026-06-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("renderAuditSummary (v0.3.6)", () => {
  it("renders workflow.definition.create", () => {
    const event = makeEvent({
      action: "workflow.definition.create",
      entityType: "workflow_definition",
      entityId: "quote-approval",
      after: { name: "报价审批流", targetObject: "quote" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("workflow");
    expect(summary.summary).toContain("创建了工作流定义");
    expect(summary.summary).toContain("报价审批流");
    expect(summary.detail).toContain("quote");
    expect(summary.linkRoute).toBe("/workflows");
  });

  it("renders workflow.transition", () => {
    const event = makeEvent({
      action: "workflow.transition",
      entityType: "workflow_instance",
      entityId: "wfi_test",
      before: { state: "draft", workflowId: "wf1", objectType: "quote", recordId: "rec1" },
      after: { state: "pending_approval", transitionLabel: "提交审批", comment: "请审核" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("workflow");
    expect(summary.summary).toContain("执行了状态转换");
    expect(summary.summary).toContain("提交审批");
    expect(summary.detail).toContain("draft → pending_approval");
    expect(summary.detail).toContain("请审核");
  });

  it("renders workflow.approve", () => {
    const event = makeEvent({
      action: "workflow.approve",
      entityType: "workflow_instance",
      entityId: "wfi_test",
      before: { state: "pending_approval" },
      after: { state: "approved", transitionLabel: "批准", comment: "同意" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.summary).toContain("审批通过");
    expect(summary.detail).toContain("pending_approval → approved");
  });

  it("renders automation.create", () => {
    const event = makeEvent({
      action: "automation.create",
      entityType: "automation_definition",
      entityId: "auto_test",
      after: { name: "逾期提醒" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("automation");
    expect(summary.summary).toContain("创建了自动化规则");
    expect(summary.summary).toContain("逾期提醒");
    expect(summary.linkRoute).toBe("/automations");
  });

  it("renders automation.run", () => {
    const event = makeEvent({
      action: "automation.run",
      entityType: "automation_definition",
      entityId: "auto_test",
      actorType: "system",
      actorId: "automation-runtime",
      after: { automationId: "overdue-reminder", status: "success", actionsCount: 2, triggerType: "manual" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("automation");
    expect(summary.summary).toContain("自动化执行完成");
    expect(summary.detail).toContain("success");
    expect(summary.detail).toContain("2");
  });

  it("renders automation.run_fail", () => {
    const event = makeEvent({
      action: "automation.run_fail",
      entityType: "automation_definition",
      entityId: "auto_test",
      after: { automationId: "broken-automation", status: "failed", triggerType: "schedule" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.summary).toContain("自动化执行失败");
    expect(summary.detail).toContain("failed");
  });

  it("renders record.create", () => {
    const event = makeEvent({
      action: "record.create",
      entityType: "company",
      entityId: "rec_abc123",
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("record");
    expect(summary.summary).toContain("创建了公司记录");
  });

  it("renders dashboard.widget.configure", () => {
    const event = makeEvent({
      action: "dashboard.widget.configure",
      entityType: "dashboard_layout",
      entityId: "wdl_test",
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("dashboard");
    expect(summary.summary).toContain("配置了仪表盘组件");
  });

  it("renders workspace.create", () => {
    const event = makeEvent({
      action: "workspace.create",
      entityType: "workspace",
      entityId: "ws_test",
      after: { name: "我的工作区" },
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("admin");
    expect(summary.summary).toContain("创建了工作区");
    expect(summary.summary).toContain("我的工作区");
  });

  it("renders unknown actions with fallback", () => {
    const event = makeEvent({
      action: "unknown.action" as AuditEvent["action"],
      entityType: "unknown_entity",
      entityId: "ent_test",
    });
    const summary = renderAuditSummary(event);
    expect(summary.category).toBe("system");
    expect(summary.summary).toContain("unknown.action");
    expect(summary.detail).toContain("unknown_entity");
  });

  it("truncates long entity IDs", () => {
    const longId = "rec_very_long_identifier_that_should_be_truncated";
    const event = makeEvent({
      action: "record.create",
      entityType: "company",
      entityId: longId,
    });
    const summary = renderAuditSummary(event);
    expect(summary.detail).toContain("…");
    expect(summary.detail!.length).toBeLessThan(longId.length + 20);
  });

  it("uses correct actor labels", () => {
    const systemEvent = makeEvent({
      action: "automation.run",
      entityType: "automation_definition",
      entityId: "auto_test",
      actorType: "system",
      actorId: "automation-runtime",
      after: { automationId: "test", status: "success", actionsCount: 1, triggerType: "manual" },
    });
    const summary = renderAuditSummary(systemEvent);
    expect(summary.summary).toContain("系统");
  });
});
