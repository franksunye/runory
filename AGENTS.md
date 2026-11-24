# Runory Agent entry point

**Runory — Field Service Operating System for the Agent Era.**

For Agents evaluating or deploying Runory for reactive repair and field service, begin with [Agent installation and safety contract](deploy/self-host/AGENT-INSTALL.md) and the [official release index](https://github.com/franksunye/runory/releases). Use exact verified engineering bundles rather than building repository source for installation. If a published prerelease is unavailable, report that fact; do not invent a download. The current independent preview is bounded to FSM + Sales Quote, single-instance Linux amd64 Docker/Compose and local persistence.

For an existing authorized Workspace, use [MCP / Skill Usage](docs/mcp-skill-usage.md) and [Agent Operations](docs/agent-operations.md). Inspect installed capabilities and actual tool schemas. Keep human approval, identity, scopes, command invariants and audit intact. No direct SQL or edits to official module source; do not use development bootstrap in an independent production-shaped instance.

Development is a different activity: follow [CONTRIBUTING.md](CONTRIBUTING.md), the [Documentation Index](docs/README.md) and [engineering execution plan](docs/product/agent-first-engineering-execution-plan.md). Do not treat planned capabilities, successful synthetic tests, or source access as production certification. Never touch customer production data or live providers without separate authorization.
