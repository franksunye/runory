# Runory — Field Service Operating System for the Agent Era

## Decide whether this candidate fits

The independent distribution is an **engineering preview**, not a production-supported release. It is for small reactive repair/callout and field-service evaluation. It bundles the existing FSM and Sales Quote Packs, supports one Linux amd64 Docker/Compose instance, local SQLite and attachments, and provides the same governed API, UI and existing MCP tools as the shared runtime. No Runory Cloud account, external LLM key, or mail service is needed in the owner-only mode.

Use synthetic data. Do not expose this preview to the internet, promise arbitrary Module/schema upgrades, enable live providers or accept customer production work. Other architectures/OS, public TLS, multi-user provider acceptance, and complete Agent-led FSM command coverage are not established by this preview.

## 1. Obtain an exact verified bundle

Official distribution index: https://github.com/franksunye/runory/releases

Choose a prerelease tagged `self-host-preview-<source-sha>`, not an arbitrary repository ZIP or latest branch. Download `runory-self-host-linux-amd64.tar.gz` and its release `SHA256SUMS` from that same official release. The release page must identify the successful Candidate run (including both fresh-host consumer jobs), aggregate Release Gate, source commit and acceptance scope. If no such prerelease exists, use an existing approved engineering artifact only for private testing; report that the public release is not available. Never invent an asset URL.

With both files in a new directory, use Bash to verify the archive before extracting it:

```bash
set -euo pipefail
archive=runory-self-host-linux-amd64.tar.gz
awk -v file="$archive" '$2 == file { print; count++ } END { if (count != 1) exit 1 }' SHA256SUMS | sha256sum --strict --check -
mkdir runory-bundle
tar -xzf "$archive" -C runory-bundle
cd runory-bundle
sha256sum --strict --check SHA256SUMS
```

The extracted bundle includes `release.json`, `catalog.json`, `release-profile.json`, `upgrade-scope.json` and this guide. Stop on any integrity failure; use a fresh empty extraction directory.

A SHA-256 check establishes transfer integrity against the trusted official release, not a separate publisher signature. Keep the selected archive and metadata for rollback; do not execute a downloaded shell script from an unrelated location.

## 2. Install on an owner-authorized host

Prerequisites: Docker Engine, Compose v2 with `up --wait`, Linux amd64, Bash, OpenSSL, GNU sha256sum and sufficient disk space for image extraction and data. Use an empty directory, fresh instance and available local port 3000. Obtain approval before installing containers or touching any existing instance.

Inside the extracted bundle:

```sh
sha256sum --check SHA256SUMS
bash runory.sh load
bash runory.sh init OWNER_EMAIL
bash runory.sh start
bash runory.sh doctor
```

Replace OWNER_EMAIL with the owner's chosen identity. Do not create a second instance on top of existing data. Keep the generated private `.env`, runtime secrets and data volume under owner control; do not read them into an Agent conversation. The commands return explicit failures; stop and report any error. Docker administrative access is privileged.

## 3. Establish owner session and scoped Agent access

The owner opens http://localhost:3000/en/login, requests a verification code for the configured identity, and runs `bash runory.sh code` in their own authorized interactive host terminal. **The owner enters the code in the browser**. Never retrieve the owner's OTP in an Agent session, logs, prompts or automation. The local delivery mode is proof of host control, not external email ownership. Multi-user email delivery requires the separate private provider configuration.

The first login creates a Workspace. The owner can install `fsm-pack` and `sales-quote-pack` via Modules, without demo data, and issue a Workspace-scoped API key via Settings. Start read-only (`workspace:read`); obtain only the extra scopes required for separately authorized operations (`extensions:manage` for Pack/extension changes and `records:write` for supported business writes). Never grant the Agent a platform-admin session or direct database access. Use the client's secure credential mechanism, not a pasted token.

The local stdio entry point is `bash runory.sh mcp`. It requires an already running verified bundle and an authorized Workspace API key and ID. For a same-host MCP client, configure the executable and arguments below using the absolute extracted bundle path:

```json
{
  "command": "bash",
  "args": ["/absolute/path/to/bundle/runory.sh", "mcp"],
  "env": {
    "RUNORY_API_KEY": "<securely supplied workspace key>",
    "RUNORY_WORKSPACE_ID": "<authorized workspace ID>"
  }
}
```

The key placeholder is not a literal token. This command uses the MCP server already inside the installed image; no host Node.js, pnpm, source clone or separate MCP runtime installation. Do not hardcode the real key in a shared config file. If the Agent is on a different machine, no remote exposure is implied; use an authorized local host execution path.

Start with `pack.list` and `object.inspect`, then `record.list`. Verify the Workspace and actual tool schemas. If authorized, install missing bundled Packs with `pack.install` and use existing governed plan/preview/apply operations for extensions. Named FSM command exposure via MCP is being completed in B2; do not infer that a generic record update may replace approval, dispatch, invoice, payment or lifecycle commands.

## 4. Verify and maintain

Confirm source commit and readiness via `doctor`, the installed Packs, a synthetic business record read back in both UI and API/MCP, and key revocation. Record elapsed installation time, human authorization steps, failures and unsupported requirements. Do not call a scripted fixture an independent Agent trial.

Use `status` / `doctor` / `stop` for maintenance. Retain the complete original bundle and data backup. Only the explicitly compatible same-schema/Catalog runtime upgrade path in `README.md` is admitted for rehearsal, and only when its exact upgrade scope passed. Never change a release marker, overwrite a data volume, silently downgrade, or roll back over live writes.
