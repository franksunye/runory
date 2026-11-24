# 2026-11-24 发布加固操作清单

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `operations` |
| Applies to | 2026-11-24 候选版本；审计第 1、2 批 |
| Owner | Operations / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

本清单支持 [Operations Runbooks](runbooks.md)，限定于已授权的审计第 1、2 批：修复已确认缺陷并形成可验收的 Cloud 候选版本。它不是已发布记录、完整 GA 结论或生产验收证明。最终 commit、执行结果和证据位置由发布负责人补齐；不以历史测试结果替代当前版本验证。

## 已实现的变更

| 范围 | 当前实现与边界 |
| --- | --- |
| API key、租户与业务角色 | 权限取创建者当前角色与 Key scopes 的交集；无效 Bearer 不回退到 Cookie；Key 只能发现所属 Workspace。诊断 target 与 baseline 分别授权。非管理员没有业务角色时默认拒绝业务 Command；凭据和成员管理要求用户会话。参见 [管理与治理](../admin-governance.md)。 |
| 技师现场交付与改派 | 已有 `visit.execute` 和 `forms.submission.submit` 的用户可完成确实指派给本人的现场表单任务；资源策略限定内置完工契约，当前需求、任务、资源及有效指派必须同租户一致。提交事务再次核对资源归属；改派同步未完成任务的负责人、认领与版本，陈旧完工事务不能记录成功。API Key 沿用原权限与 scopes，详见 [命令架构](../architecture/contract-driven-command-architecture.md)。 |
| Stripe Connect | 精确豁免 Connect webhook 的浏览器 CSRF 检查，保留原始请求体验签。真实本地 Next HTTP 脚本验证合成签名事件更新数据库、重复投递业务状态稳定、坏签名不写库。`account.updated` 是状态幂等更新，重复时可刷新同步时间，不宣称事件只处理一次。 |
| 持久升级与回滚 | [迁移 0054](../../schema/migrations/0054_upgrade_snapshots.sql) 保存不可变升级快照和执行状态；快照写入失败阻止后续升级。重开连接后可读取快照；校验损坏、范围不符或后续元数据变化时拒绝伪造回滚成功。SQL 已尝试执行时明确要求数据库恢复。 |
| Voice Intake 原子性 | Provider receipt、关联业务状态以及 intake 操作的业务写入、回放结果和 outbox 意图纳入数据库事务；失败可重试，嵌套调用复用外层事务。外部电话和邮件投递不属于数据库事务。 |
| 生产开发开关隔离与邮件 | Bootstrap、Persona、OTP 调试与相关 UI 只在本地开发运行时启用；生产构建不会嵌入调试身份开关。生产 OTP 优先使用自定义邮件 URL，未配置时支持项目已有的 Resend key/from；投递超时或失败使该次验证码失效，日志不含验证码或 Provider 响应。 |
| 附件持久存储 | 支持本地持久目录与 Vercel **private Blob**；鉴权后服务端流式下载，数据库保存版本化 provider/store/key 引用。Vercel 缺配置时拒绝上传，不回退本地。上传失败有补偿，旧对象不可读时去重重试不误报成功。配置扫描器后错误严格拒绝；未配置的可选扫描明确记为 `not_configured`。参见 [附件操作说明](attachment-storage.md)。 |
| 依赖与兼容 | 更新直接和传递依赖、修复 Zod 4 契约兼容，按锁文件安装。生产依赖门槛阻止未审查的 High/Critical 命中；MapLibre 的精确 backport 例外见下文。 |
| CI 与当前版本恢复 | 新增 [Release Gate](../../.github/workflows/release-gate.yml)：测试、类型检查、生产构建、依赖检查、本地 G1/G2 与恢复演练。恢复工具只读源库、只接受新的本地目标，校验数据/结构摘要、完整性、外键并重开验证。当前版本演练要求真实迁移、Catalog/安装记录和合成业务数据。工作流存在不等同于远程检查已通过或分支保护已配置。 |

## 升级兼容性与操作要求

1. **普通成员必须有明确业务角色。** 迁移前列出有效成员及其预期角色，由管理员分配；清空最后一个角色不会恢复旧版默认放行。管理员权限保留。外部 Agent/集成 Key 必须显式具备所需 scopes，不能再用只读 Key 执行写入。
2. **应用快照不能逆转任意 SQL。** 一旦升级尝试执行 schema/data SQL，回滚返回 `requires_database_restore`；必须使用已验证的数据库恢复流程，不能只把安装版本号改回旧值。先执行 [备份与恢复操作说明](backup-restore-runbook.md)，保留独立恢复目标。
3. **旧附件必须迁移原字节。** 裸 `workspace/id` 仍代表本地文件；改环境变量不会把它变成 Blob。校验字节数与 SHA-256、上传并回读后，才同步更新 `storage_path` 与 `storage_key`。新引用不能由旧版仅磁盘 reader 读取；应用回滚必须选择兼容 reader，或恢复配套的引用与字节。数据库备份不包含附件字节。
4. **生产必须配置真实邮件 Provider。** 调试 OTP 和开发身份不再是部署后的登录替代方案。确认生产登录、邮件投递、有效会话及管理员权限后再开放使用。
5. **Vercel 附件每文件 4 MiB，本地 10 MiB。** UI 从鉴权 policy 接口读取限制。连接 private store，配置 `RUNORY_ATTACHMENT_STORAGE=vercel-blob` 和 `BLOB_STORE_ID`；显式静态 token 连接使用该 token，无静态 token 时让 SDK 管理 OIDC 刷新。按上传政策配置扫描器及 `RUNORY_MALWARE_SCAN_REQUIRED`。对象写入与 DB 不构成分布式事务，补偿失败或进程中断留下的孤立对象需按引用对账。
6. **MapLibre 例外严格限定。** [依赖检查脚本](../../scripts/check-production-dependencies.mjs) 只对 `GHSA-jrc7-96c5-q579` 且实际命中版本全部恰为 `maplibre-gl@5.24.1` 接受维护者 backport 证据；不是整包或整项公告的长期豁免。依据：[维护者公告](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)、[5.24.1 发布记录](https://github.com/maplibre/maplibre-gl-js/releases/tag/v5.24.1)。版本变化或出现其他公告必须重新评估，保留原始审计结果。
7. **既有技师角色无需新增通用工作流权限。** 新资源策略使用现有现场执行和表单提交权限。部署前已改派、但工作项仍保留旧负责人名下的历史不一致记录会被拒绝；管理员或调度员需通过正常改派操作重新同步未完成任务，本次不执行隐式全库修复。已完成的任务历史保持原归属。

## 验证命令与证据

除单独注明外，从仓库根目录运行。使用项目声明的 Node/pnpm 版本和独立合成数据库；不要将生产库或真实 Provider 凭据作为测试 fixture。

| 检查 | 命令 |
| --- | --- |
| 全包测试 | `corepack pnpm test` |
| 权限、生产开发边界与附件 | `corepack pnpm --filter @runory/cloud exec vitest run src/lib/security-boundaries.test.ts src/lib/development-boundaries.test.ts src/lib/attachment-routes.test.ts src/lib/attachment-storage.test.ts src/middleware.test.ts` |
| 升级、Voice 原子性与备份恢复 | `corepack pnpm --filter @runory/platform-core exec vitest run src/upgrade-recovery.test.ts src/upgrade-executor.test.ts src/voice-intake.test.ts src/database-backup.test.ts --maxWorkers=1` |
| 类型与生产构建 | `corepack pnpm typecheck`；`corepack pnpm --filter @runory/cloud build` |
| 生产依赖与文档 | `corepack pnpm audit:production`；`corepack pnpm docs:check` |
| 当前版本本地 G1/G2、Connect HTTP 与恢复 | `corepack pnpm verify:release:local` |

Connect HTTP 可独立运行，工作目录为 `apps/cloud`：

```bash
node --import tsx scripts/verify-connect-http.mts --report=../../artifacts/connect-http.json
```

该脚本使用合成 HMAC、独立临时 DB 和真实 Next HTTP；URL/socket 防护只允许 loopback，Next 的可选版本查询在本地被阻断。

`verify:release:local` 要求已提交、工作区干净且没有 dotenv 文件；生成新的本地 fixture，不复用其他服务。证据保存在 `apps/cloud/test-results/release/`，包括 API、Connect、恢复及带 commit 的汇总，浏览器报告位于 `apps/cloud/test-results/e2e/browser-report.json`。CI 同时保留隔离 fixture 的服务日志与浏览器 trace、截图和视频，包含重试前的失败记录；这些证据可能包含临时本地会话，只适用于不带真实 Provider 凭据或客户数据的隔离运行，不保存数据库备份。浏览器错误实时输出，重试仍失败后立即阻止发布；剩余未运行用例不视为通过。最终结果必须绑定同一干净 commit；本清单不预填测试数量或 SHA。

CI 将桌面和手机浏览器分为两个并行作业，每个作业使用独立服务器、数据库和上传目录；两者都成功才满足 Release Gate。`RUNORY_BROWSER_PROJECT` 只接受这两个已配置的浏览器名称；本地不设置时仍完整执行两者。

## 发布操作清单

本次将根目录和 Cloud 的 `vercel.json` 设为 `git.deploymentEnabled=false`：推送只发布代码并触发 GitHub 检查，生产部署由发布负责人在 **Release Gate** 成功、数据库/附件/邮件配置核对后，按确切 commit 显式创建和验收，再推广到生产域名。该设置不代表 CI 已绿或线上已更新；不要通过推送直接跳过这些步骤。参见 [Vercel Git 配置](https://vercel.com/docs/project-configuration/git-configuration) 和 [按 Git reference 创建部署](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)。

- [ ] 固定候选 commit；运行上述必要门槛并归档当前证据，确认失败项均有明确处置。
- [ ] 审查成员业务角色与 Key scopes 的兼容影响；应用迁移 0054 前保存可独立恢复的数据库备份。
- [ ] 确认旧附件迁移、private Blob、扫描政策和附件保留窗口；选定兼容新引用的应用回滚候选。
- [ ] 获得实际 Vercel 团队/项目访问后，核对域名、环境、部署 SHA、构建/运行日志、数据库、邮件、cron 及各 Provider 配置。
- [ ] 完成真实部署附件跨实例/跨部署下载、租户拒绝、Provider 回调和受控恢复验收，再记录发布决定。

## 尚未完成的外部验收

2026-11-24 已通过正确账号访问实际 Vercel 团队 `sun's projects` 及 `runory` 项目，原先的账号权限阻塞已解除。现已核实该团队为 **Hobby**，而 Cloud 配置的 workflow timer 是 `* * * * *`。Hobby 只允许每天运行的 cron，分钟级表达式会阻止部署；旧失败状态也指向该限制的官方说明。本次候选移除 Vercel 的分钟级调度声明，保留受密钥保护的 workflow timer 执行端点。在未来的 Cloudflare Worker 调度上线前，自动触发暂停；生产状态以本候选推广后的核验为准。参见 [Cron 使用与限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)。

已创建项目的 private Blob store，并将其静态读写 token 设为 sensitive、仅限 Production。已补齐 Production 的附件 provider/store、cron 密钥、客户访问会话密钥、正式站点 URL 和 `RUNORY_RELEASE_BACKUP_REQUIRED=1`；关闭部署环境的调试 OTP，明确 Cloud 模式。Vercel 项目设为生产部署先暂存、验收后显式推广。配置写入不等于新版本已部署或真实 Provider 已验证。

生产数据库凭据为 Vercel sensitive 变量，管理 API 不提供其内容。发布备份在已授权的生产构建环境内使用现有变量，只读源库、恢复到新的临时库并重开校验，再上传到 private Blob 并回读验证；任何必要步骤失败阻断构建。备份不导入迁移或 seed 入口，不把业务数据或凭据输出到日志、源码、构建产物或公开 URL。实际云端执行结果仍须随目标 commit 验收。

修复了 G2 验收中的过期命令文案，并加强角色拒绝证据：先证明授权角色能看到有效操作，再验证受限角色的 API 必须明确返回权限拒绝且状态不变。浏览器追踪另确认上传规则已成功返回，但表单区块缓存遗漏策略状态，导致入口持续禁用；移除该错误缓存，并验证真实策略响应延迟到达、答案未修改时入口仍能就绪。表单验收同时等待提交成功、关联工作项完成及页面成功提示。完整 Gate 是否通过，以该候选 commit 对应的 GitHub Actions 结果为准。

GitHub `main` 已启用分支保护，必需检查为 GitHub Actions 的 `Release Gate`，并要求检查基于最新分支。保持现有 main-only 工作方式，不强制 PR；管理员仍可直接更新分支，因此生产发布仍必须单独核对确切 commit 的 Gate 结果。禁止强制推送与删除分支。

以下仍需在实际受控环境验收：private Blob/OIDC 连接及跨部署字节恢复、扫描 Provider、生产 OTP 投递、真实 Stripe Connect/Retell 回调、cron 调度和外部投递，以及所选数据库 Provider 的备份/PITR/恢复能力。真实商户开通、真实设备与 Provider 例外场景仍属于 G4；本地数据库恢复不验证外部附件或 Provider 状态恢复，也不认证生产 RPO/RTO。

本批不扩展到第 3 批外部 Agent/MCP 新能力、第 4 批商业验证，也不改变 v1.0 GA 的产品范围或宣告所有发布 Gate 关闭。
