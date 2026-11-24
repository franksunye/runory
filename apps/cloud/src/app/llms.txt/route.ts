export const dynamic = "force-static";

export function GET() {
  const body = `# Runory

Runory is the field service operating system for the Agent era.

## Product
Runory unifies CRM, Sales, Voice and Messaging Intake, Field Service Management, payments, and retention workflows in one governed business runtime.

## Agent model
External Super Agents such as ChatGPT, Codex, Claude, Cursor, Trae, and compatible enterprise Agents connect through MCP, Skills, or SDK. Agents provide intelligence and orchestration. Runory provides business data, permissions, validation, deterministic commands, workflow state, audit, and rollback where supported.

## Core product pages
- https://runory.vercel.app/product
- https://runory.vercel.app/voice
- https://runory.vercel.app/agent
- https://runory.vercel.app/platform
- https://runory.vercel.app/solutions
- https://runory.vercel.app/pilot

## Resources
- https://runory.vercel.app/resources
- https://runory.vercel.app/docs
- https://github.com/franksunye/runory

## Self-hosted engineering preview
- Official release index: https://github.com/franksunye/runory/releases
- Agent installation contract: https://github.com/franksunye/runory/blob/main/deploy/self-host/AGENT-INSTALL.md
- Agent entry point: https://github.com/franksunye/runory/blob/main/AGENTS.md
- Independent scope: single-instance Linux amd64 Docker/Compose, FSM and Sales Quote Packs. Use a verified prerelease when available; do not assume a supported production release or public remote deployment. Owner authorization and scoped Agent credentials are required.

## Primary use cases
Reactive repair and callout for home services, HVAC, plumbing and waterproofing: inspection, quoting, scheduling, dispatch, field execution, evidence capture, completion, and after-sales. Live providers and additional trades or capabilities require separate acceptance.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
