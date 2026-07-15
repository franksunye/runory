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

## Primary use cases
Home services, HVAC, plumbing, waterproofing and repair, installation services, inspection, quoting, scheduling, dispatch, field execution, evidence capture, completion, payment, and after-sales.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
