# Security Policy

Security is a core design requirement for Runory. The platform allows humans and external AI agents to operate business workflows through MCP, SDKs, APIs, governed commands, permissions, audit trails, and rollback controls.

## Supported versions

Runory is currently in public preview. Security fixes are applied to the latest code on the `main` branch and, when applicable, to the most recent published release. Older preview versions may not receive backported fixes.

| Version | Supported |
| --- | --- |
| Latest `main` / latest release | Yes |
| Older preview releases | No guaranteed backports |

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Please use GitHub's private vulnerability reporting or open a private security advisory for this repository. Include enough information for maintainers to understand and reproduce the issue without exposing sensitive production data.

A useful report includes:

- A clear description of the vulnerability and its impact
- Affected component, version, commit, or deployment mode
- Reproduction steps or a minimal proof of concept
- Required permissions, tenant context, or Agent scope
- Relevant logs, requests, command inputs, or screenshots with secrets removed
- Suggested remediation, when available

If private vulnerability reporting is unavailable, contact the repository owner through their GitHub profile to request a secure communication channel. Do not include exploit details in the initial public message.

## Response process

Maintainers will aim to:

1. Acknowledge a valid report within 5 business days.
2. Assess severity, affected versions, and mitigation options.
3. Coordinate remediation and disclosure with the reporter.
4. Publish a fix and security advisory when appropriate.

Response times may vary during public preview, but reports involving authentication bypass, cross-tenant access, command execution, secret exposure, or business-state integrity will be prioritized.

## Security-sensitive areas

Reports are especially valuable in the following areas:

- Authentication, sessions, API keys, and delegated Agent identity
- Workspace and tenant isolation
- Role-based access control and scoped permissions
- MCP tools, SDK contracts, and command validation
- Prompt injection or tool-injection paths that can cause unauthorized actions
- Approval gates, high-risk actions, and human confirmation
- Audit-log integrity, idempotency, rollback, and transaction handling
- Module, Pack, extension, manifest, and supply-chain boundaries
- Database migrations, exports, files, evidence, and secret handling
- Webhooks, integrations, event processing, and replay protection

## Safe-harbor intent

We support good-faith security research that avoids privacy violations, data destruction, service disruption, social engineering, and access to data beyond what is necessary to demonstrate the issue. Please stop testing and report immediately if you encounter personal, customer, payment, credential, or other sensitive data.
