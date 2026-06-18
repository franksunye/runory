# Runory Managed Workspace Extension 架构规范

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. 定义

**Managed Workspace Extension** 是绑定到具体 Cloud Workspace（或 Private / Local Workspace）的声明式扩展层，用于在不修改官方 Module 源码的前提下增加用户特有能力。

它不是 Official Module，也不是一次性的 Agent 代码改动。它是 Platform Core 可以校验、版本化、合并、审计、Diff、Apply、Rollback 的运行时业务配置层。

核心原则：

> 官方 Module 提供标准能力；Managed Workspace Extension 表达用户差异。

```text
Effective App
=
Official Module
+
Workspace Template Overlays
+
Managed Workspace Extension
```

## 2. 设计原则

* Official Module 只读；
* Managed Workspace Extension 可写（通过 governed APIs）；
* 所有变更可审计、可版本化、可 Diff、可回滚；
* 扩展必须通过 Schema 校验；
* 扩展不能绕过 Business Engine；
* 官方 Module 升级不能覆盖用户扩展；
* **Built-in Agent**（默认）和 **MCP / SDK**（高级）使用同一套 Agent Operation API 与权限模型；
* Agent 生成 Extension Plan，Platform Core 是唯一 Apply 边界；
* Cloud-first 不等于 Cloud-only：Extension 定义必须可导出到 Private / Local Runtime。

## 3. 扩展类型

Runory 支持以下扩展类型：

```text
Custom Fields
Custom Objects
Custom Relations
Custom Views
Custom Forms
Custom Workflows
Custom Rules
Custom Dashboards / Metrics
Custom Automations
Custom Actions
Custom Agent Skills
Custom UI Slots（within Module-declared boundaries）
Custom Reports
Custom Notifications
```

### Custom Fields

为官方 Object 增加 workspace-specific 字段。例：给客户增加「客户等级」。

Agent 正确路径：

```text
Create Workspace Extension:
- add field: customer.tier
- update list view column
- update form section
- update permission if needed
- record audit log
```

Agent **不应**修改 `runory.customer` Module 源码。

### Custom Workflows

增加 workspace-specific 流程。例：报价金额超过 10 万需经理审批。

```text
识别 Quotation Object
→ 创建 Approval Workflow Extension
→ 添加 Rule
→ 配置 Role
→ 生成测试样例
→ Diff Preview → 用户确认 → Apply
```

## 4. 字段归属

必须明确字段归属：

```text
Core-owned Field       → 如 created_at（Agent 不可删改定义）
Module-owned Field     → 如 Customer.name（Extension 不可覆盖）
Workspace Extension    → 如 Customer.vip_level（Extension 命名空间下）
Agent-computed Field   → 如 Customer.ai_score（Computed，需声明来源与刷新策略）
User-created Field     → 通过 Extension 创建，受 Extension 生命周期管理
```

归属影响：是否可删除、是否可升级、是否可迁移、Agent 是否可修改、是否出现在标准 API。

## 5. 数据模型

Cloud 版本建议使用 PostgreSQL 保存 Extension 状态。Portable Runtime 可使用等价 schema（SQLite 或 PostgreSQL）。

### Platform tables（Cloud）

```text
extension_definitions
extension_versions
custom_field_definitions
custom_field_values
custom_view_definitions
custom_form_definitions
custom_workflow_definitions
custom_rule_definitions
extension_audit_logs
agent_runs（Agent apply 记录）
rollback_points
```

### `extension_definitions`

```text
id / workspace_id / tenant_id
name / description / namespace
target_module_ids
status / current_version
created_at / updated_at / created_by
```

### `extension_versions`

```text
id / extension_id / version
manifest_json
risk_level / change_summary / diff_json
created_at / created_by / approved_by
applied_at / rollback_of_version
```

字段完整定义见 POC 实施阶段的数据库设计。Cloud POC 必须至少实现 `extension_definitions`、`extension_versions`、`extension_audit_logs` 和 rollback 引用。

## 6. Runtime Composition

Platform Core 在运行时合并官方 Module、Template 和 Workspace Extension：

```text
Official Module Manifest
+ Workspace Template Overlays
+ Managed Workspace Extension Manifest
=
Effective Runtime Model
```

Effective Runtime Model 包含：

```text
effective objects / fields / relations
effective rules / workflows / actions
effective views / forms / navigation
effective metrics / permissions
effective event subscriptions / agent skills
```

合并必须是确定性的。同一组 Core 版本、Module 版本、Template 版本、Extension 版本，应得到同一个 Effective Runtime Model。

## 7. Agent 工作流（Built-in Agent 与 MCP 共用）

Managed Workspace Extension 由 Agent 辅助生成，由 Platform Core 执行。

```text
用户提出修改
→ Agent 解析需求
→ 查询当前 Schema 与 Extension Points
→ 生成 Extension Plan
→ Diff Preview
→ Permission Check
→ 用户确认（中高风险）
→ Agent Operation API Apply
→ Business Engine 校验并写入
→ 创建 Rollback Point
→ Audit Log
→ Event 发布
→ UI 更新
```

Agent 可以：

* 解释可行方案；
* 推荐 Pack 或 Extension 路径；
* 查询 Module、Object、Field、View、Workflow；
* 生成 Extension Plan 和 Workflow Plan；
* 调用 preview、validate、apply、rollback API。

Agent 不可以：

* 直接改数据库；
* 直接改官方 Module 源码；
* 直接写 React 生产代码；
* 绕过 Agent Operation API 权限；
* 跳过 Diff 或用户确认（中高风险）；
* 修改 Core、Billing、跨租户 Runtime 或 Module Dependency Resolver。

## 8. Agent Operation API

Extension 管理通过受控 API 暴露（Built-in Agent 与 MCP 镜像）：

```text
runory.schema.inspect
runory.extension.plan
runory.extension.validate
runory.extension.preview      # returns diff
runory.extension.apply
runory.extension.rollback
runory.extension.list_versions
runory.extension.audit
runory.workflow.plan
runory.workflow.preview
runory.workflow.apply
```

所有 `apply` 和 `rollback` 必须：写入 audit log、创建 rollback point、发布 business event、触发 Effective Runtime Model 重组。

Apply 流程：

```text
Permission Check → Diff → Approval（if needed）→ Apply → Validate → Audit
```

## 9. 风险等级

### Low Risk

可自动 Apply（仍须 Audit）：非必填字段、列显示、只读 Widget、保存筛选视图。

### Medium Risk

必须 Diff Preview + 用户确认：必填字段、Relation、业务规则、Automation、Workflow 步骤、表单校验变更。

### High Risk

必须影响分析 + Rollback 方案 + 明确确认：删字段、改字段类型、批量迁移、权限变更、覆盖主视图结构、影响历史报表口径。

## 10. 升级与冲突

### Namespace

```text
workspace.{workspaceId}.{extensionKey}
```

### Module Upgrade Compatibility

Module 升级时 Core 检查：Extension Slot 是否存在、target object 是否存在、字段类型是否兼容、Workflow 引用是否有效、Agent Skill 参数是否兼容。

冲突时：阻止静默覆盖，生成报告，提供重命名、映射、保留或取消升级选项。

### Extension Reapply

Module 升级后，Core 重新计算 Effective Runtime Model 并将兼容 Extension  reapplied。

### Rollback

每次 Apply 前创建 Rollback Point。Rollback 恢复 extension manifest 及关联 field/view/workflow 定义。历史业务数据是否回滚按风险等级单独确认。

## 11. UI 合并规则

Module 通过 **UI Slots** 声明可扩展位置：

```text
customer.form.basic_fields.after
customer.list.columns
customer.detail.sidebar
dashboard.crm.widgets
```

Workspace Template 决定导航、首页和角色入口；Extension 在 Slot 内添加内容。

Workspace Extension 默认只能扩展视图，不能完整覆盖官方视图。完整 View Override 属于 High Risk，须 Module 显式允许。

## 12. 安全边界

明确禁止：

* 直接改官方 Module 文件；
* 直接改数据库 Schema（绕过 metadata runtime）；
* 直接写 React 代码；
* 绕过 Tool / API 权限；
* 绕过 Audit；
* 覆盖官方 MCP Tool 或 Agent Operation API；
* 无审计高风险 Automation；
* 在未声明 Extension Point 的位置注入 UI；
* 跨租户访问或修改。

## 13. Cloud Export

Workspace Extension 必须包含在 Workspace Export 中，以支持 Cloud → Private / Local 路径。见 [cloud-to-local-workspace.md](cloud-to-local-workspace.md)。
