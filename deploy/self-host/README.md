# Runory Self-hosted — B1 engineering candidate

**Runory — Field Service Operating System for the Agent Era.**

This is the first independent container packaging increment, not a public release, production support promise, or complete installer. See the [Agent-first engineering plan](../../docs/product/agent-first-engineering-execution-plan.md) and [B0 baseline](../../docs/releases/agent-first-b0-baseline-2026-11-24.md).

## Candidate profile

Linux amd64 with Docker and Compose; one production Next.js server, local SQLite/libSQL file and attachment directory in a persistent volume, and the existing authenticated workflow timer coordinator. The image deliberately retains the existing monorepo build and dependencies while the candidate is verified; production footprint and immutable distribution will be reviewed before release.

CI builds from a clean tracked snapshot and starts a fresh image on an internal network. It checks normal production OTP authentication through a separate synthetic mail endpoint, authenticated candidate catalog initialization, FSM/Sales Quote installation, a persisted customer, key scopes and revocation, the existing timer coordinator, and restart readback. The fixture is excluded from the image. No external provider is activated.

The supplied Compose file is a candidate operator configuration. A genuine owner-controlled mail delivery endpoint compatible with the existing `PLATFORM_MAIL_PROVIDER_URL` contract is required; do not substitute a public OTP inbox or development bypass. Full local identity/enrollment, immutable bundled catalog import, complete backup/restore, Compose runtime and mobile/TLS acceptance remain separate requirements. CI's authenticated seed route is used only to validate packaged source in an isolated fixture; it is not the proposed production release-import mechanism.

## Developer candidate build

Use a clean git checkout and run from the repository root. Do not include secrets, databases, customer files, or local test artifacts in the Docker build context.

```sh
docker build --platform linux/amd64 \
  --build-arg RUNORY_SOURCE_SHA="$(git rev-parse HEAD)" \
  -f deploy/self-host/Dockerfile -t runory-candidate:local .
```

The Compose file binds only to loopback. Configure an actual verified owner email, private mail endpoint and distinct securely generated secrets outside source control. The production session requires secure browser transport; remote access, HTTPS and operational backup/upgrade are not certified by this increment. Never open the candidate to public traffic or use real customer data before the applicable gates pass. A working HTTP health endpoint alone is not evidence of setup/readiness.

## Evidence

The [Self-hosted Candidate workflow](../../.github/workflows/self-hosted-candidate.yml) records the source SHA, image identity and redacted stage results. It does not publish images or change the existing Release Gate. Check the exact commit's results before claiming any candidate check passed.
