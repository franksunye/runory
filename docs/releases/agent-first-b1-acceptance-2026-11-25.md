# Agent-first B1 acceptance — 2026-11-25

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `releases` |
| Applies to | B1 engineering preview, `4263776cac8451c0bda3488a8d87406c6d120ab7` |
| Owner | Product / Engineering / Operations |
| Last reviewed | 2026-11-25 |
| Supersedes | — |
| Superseded by | — |

**B1 closed.** Two independent Codex sessions each installed the public bundle on a fresh Ubuntu 26.04.1 LTS Linux amd64 sandbox and completed the documented first customer task with a real Owner. This accepts the single-instance Docker/Compose engineering preview with local SQLite and attachments, bundled FSM and Sales Quote, and scoped stdio MCP. [Execution plan](../product/agent-first-engineering-execution-plan.md) · [Distribution protocol](agent-first-b1-distribution-2026-11-24.md)

## Published candidate and exact gates

| Check | Result |
| --- | --- |
| Public distribution | Release ID `457779085` was published at 07:31:09 UTC as an engineering prerelease. Its tag resolves to source `4263776cac8451c0bda3488a8d87406c6d120ab7`. Both Agents retrieved all eight assets anonymously and verified the published digests and relevant checksum manifests. [Official prerelease](https://github.com/franksunye/runory/releases/tag/self-host-preview-4263776cac8451c0bda3488a8d87406c6d120ab7) |
| Pinned bytes | Image ID `sha256:3723c5269e0452929f72c2348a5ca1f5d5b0d2c5e3a7360e9177883369e1a63d`. Bundle SHA-256 `7ded5dcdae5bb99663ef06dcfe6749e6a795784cb69decfab6a7eae5eb2ac3fa`. Image archive SHA-256 `0cbfe47469994eb59d784681c39e87c5325ad1a06d48af9893bd359d04a1774c`. |
| Candidate | PASS. The isolated candidate and the desktop and mobile source-free consumer jobs succeeded on the same commit and pinned candidate. The candidate artifact is `14976964035`. Consumer evidence artifacts are `14977434038` and `14977324595`. [Candidate run](https://github.com/franksunye/runory/actions/runs/45515290609) |
| Aggregate gates | PASS for the exact commit's Release Gate and Documentation Governance. Command Contract Governance had no applicable run for this diff. The engineering acceptance includes the bounded compatible upgrade, backup, and rollback evidence. [Release Gate](https://github.com/franksunye/runory/actions/runs/45515290708) · [Documentation Governance](https://github.com/franksunye/runory/actions/runs/45515290642) |

## Independent trials

The two fresh sessions received the following common task and the official release index. Session-specific instructions supplied only their assigned sandbox, synthetic Owner identity, authorized installation, bundle destination, and the browser and credential handoffs. Each Agent constructed its own MCP checks from the published documentation and discovered tool schemas.

> Evaluate and install the current Runory self-hosted engineering preview for a small repair-service company. Use only the official release index (https://github.com/franksunye/runory/releases) and included product documentation. Verify the exact release and integrity before installation. Obtain owner confirmation for installation, login and scoped Agent authorization, without handling the owner's verification code or collecting secrets in chat. Install the relevant field-service capabilities, create a synthetic customer record using an authorized supported interface, confirm the result in the browser and MCP, check runtime readiness, stop/restart and verify persistence. Do not use existing business data, development authentication, source builds, SQL, live providers or unsupported commands. Report steps, elapsed time, human handoffs, version, actual evidence and blockers.

Both hosts used Docker 29.1.3 and Compose 2.40.3. The Agents verified the archives, ran `load`, `init`, `start`, and `doctor` from the extracted bundle, and got HTTP 200 on the login page. Database, Catalog, attachment directory and scheduler readiness passed. The outbound outbox remained disabled.

The human Owner entered the OTP in Mac Chrome and the first login provisioned a Workspace on each host. The Owner confirmed creation of two 30-minute credentials through the protected trial helper and later revoked each key in the product's Developer access UI. Scopes were `workspace:read` for the read key and `workspace:read`, `extensions:manage`, and `records:write` for the write key. Both Agents passed the private mode-0600 handoff files directly into the packaged `bash runory.sh mcp` subprocess. The local browser coordinator independently checked the Owner authorization results and the matching customer detail link before and after each restart.

All times below are UTC on 2026-11-25. Discovery and install spans come from command timestamps. The authorization time is the handoff file timestamp. Installation is measured from bundle load through readiness.

| Check | Trial C | Trial D |
| --- | --- | --- |
| Independent host | `sbx_kNkCxtCBynH8kEgdnU9e26WDHZHv` | `sbx_MgRy5qBB8uGtWwpAjvLlcl9Mkb7B` |
| Release discovery, download and verification | 08:51:02 to 08:52:05, about 63 s to starting extraction and install | 08:51:04 to 08:52:33, about 89 s to starting install |
| Installation to ready | ~46 s from `load`; ready at 08:52:59 | 33 s; ready at 08:53:06 |
| Actual Owner authorization | 08:56:03 | 08:57:17 |
| Pack composition | FSM and Sales Quote 1.0.0 installed via MCP, zero demo records | FSM and Sales Quote 1.0.0 installed via MCP, zero demo records |
| First customer | **Juniper Pump Repair - Trial C**, `rec_29b9ce00-bd71-4c99-bf00-34483656af07`. Created at 08:58:18 and set to Customer at 08:59:24, about 3m21s after handoff. The installed company form and MCP schema exposed the supported Customer field. | **B1 Fixture Harbor Pump Repair D-1125**, `rec_3f2ca972-969b-4749-a121-4c9535a742db`. Created as Customer at 08:58:54, about 1m37s after handoff. |
| Scope enforcement | Read-key write returned `AUTH_FORBIDDEN` for missing `records:write`; sentinel search returned zero. | Read-key write returned `AUTH_FORBIDDEN` for missing `records:write`; the record list still contained only the original customer. |
| Stop/start and persistence | 21 s. HTTP was unavailable while stopped. `doctor` passed after start. MCP returned the same record and both Packs. Chrome showed one matching Customer row and the same detail link. | 18 s. HTTP was unavailable while stopped. Both containers returned healthy. Both keys returned the same Customer ID, name and creation timestamp. Chrome showed one matching Customer row and the same detail link. |
| Revocation | Owner's key list became empty. Both prior keys failed packaged MCP `record.get` with `AUTH_REQUIRED` at 09:02:25, about 23 minutes before expiry. Assertion recheck completed at 09:02:34. | Owner's key list became empty. Both prior keys failed the same packaged MCP call with `AUTH_REQUIRED` at 09:02:38–09:02:40, about 24 minutes before expiry. |
| Outcome | **PASS**, about 11m32s including Owner handoffs and final assertion | **PASS**, 11m36s including Owner handoffs |

### Command evidence

| Stage | Trial C | Trial D |
| --- | --- | --- |
| Release discovery, download, verification and gates | `cmd_96366b53928e409f8f759931b05e`, `cmd_787593825e2f461d8c73779890a0` | `cmd_007e10b55aaa4b3486a030f5d828`, `cmd_11dfc878e5c24a02a6a15ac55eb6`, `cmd_a86c3e267d5d484ab88dc91a96f1`, `cmd_fc249b2c59df4b238f491c602992` |
| Bundle installation and readiness | `cmd_7356e8ebc9e54e96989954ae2e04` | `cmd_f6eed7948b6a4d518e8b2da933a7` |
| Pack installation and first customer | `cmd_a2ba9f7aa03443928bf42f3dbfef`, `cmd_5ccfb2601c214746aa513e7f92c0`, `cmd_2f5cc3292ae24e99909ed6c7f93c` | `cmd_fd6dd011755b47a3a392657600ce`, `cmd_b6c4542b580742d6aaa9ddd082eb` |
| Denied write and side-effect check | `cmd_141e854e78bd42a18c8edf0d4b54` | `cmd_f887d77a975645a095f04ee7762a` |
| Stop/start and post-restart MCP | `cmd_59a8a4cb676348fbaccbf824b4f0`, `cmd_8b25eda5300340c4b56e11b00210` | `cmd_c2cc8a3c708a497e95e8376162b6`, `cmd_499392b609dd4dc880d309b349b4` |
| Denied requests after Owner revocation | `cmd_9ebe572b0995403abf920e2c28f0`, `cmd_816dd94ca0a2480dacbf6bffae27` | `cmd_d8b9fb64cff44fab843111852020` |

## Trial friction and scope

- Earlier trials A and B verified download, installation and readiness. The human Owner signed in to both. Their temporary browser helper used Node `fetch` to forward authorization and replaced the request Host with the loopback Host. Runory's origin check returned HTTP 403, so the scoped credentials never reached the Agents. The helper switched to a transport that preserves the validated Host and Origin. The coordinator could read the original Agent evidence but could not resume those sessions, so trials C and D started on fresh hosts and repeated the full process. The published artifact and product security checks were unchanged.
- Both independent Agents saw an empty cached release-index view and recovered through the official public repository Releases API. Their first MCP denial assertions assumed an optional top-level error flag or a uniform response shape. They verified the typed error in the real MCP payload, then checked the affected record list and retried the revoked keys before expiry.
- Customer record creation and persistence, the two bundled Packs, and scoped authority are the accepted business surface here. Full named FSM command coverage, public TLS or multi-user installation, and live provider acceptance belong to separate gates.
