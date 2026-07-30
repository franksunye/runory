import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runWorkflowTimerCron } = vi.hoisted(() => ({
  runWorkflowTimerCron: vi.fn(async () => ({
    acquired: true,
    overdueFired: 2,
    warningsFired: 1,
  })),
}));

vi.mock("@runory/platform-core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@runory/platform-core")>(),
  runWorkflowTimerCron,
}));

import { GET, POST } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const originalPlatformSecret = process.env.PLATFORM_CRON_SECRET;
const originalDevBootstrap = process.env.PLATFORM_DEV_BOOTSTRAP;

describe("Workflow Timer Cron Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "vercel-cron-test";
    delete process.env.PLATFORM_CRON_SECRET;
    process.env.PLATFORM_DEV_BOOTSTRAP = "false";
  });

  afterEach(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalPlatformSecret === undefined) delete process.env.PLATFORM_CRON_SECRET;
    else process.env.PLATFORM_CRON_SECRET = originalPlatformSecret;
    if (originalDevBootstrap === undefined) delete process.env.PLATFORM_DEV_BOOTSTRAP;
    else process.env.PLATFORM_DEV_BOOTSTRAP = originalDevBootstrap;
  });

  it("accepts Vercel's authenticated GET and executes the coordinator once", async () => {
    const response = await GET(new NextRequest(
      "https://runory.example/api/platform/cron/workflow-timers",
      { headers: { authorization: "Bearer vercel-cron-test" } },
    ));

    expect(response.status).toBe(200);
    expect(runWorkflowTimerCron).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { acquired: true, overdueFired: 2, warningsFired: 1 },
    });
  });

  it("keeps POST on the same authenticated implementation", async () => {
    const response = await POST(new NextRequest(
      "https://runory.example/api/platform/cron/workflow-timers",
      { method: "POST", headers: { authorization: "Bearer vercel-cron-test" } },
    ));
    expect(response.status).toBe(200);
    expect(runWorkflowTimerCron).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthenticated GET without running timers", async () => {
    const response = await GET(new NextRequest(
      "https://runory.example/api/platform/cron/workflow-timers",
    ));
    expect(response.status).toBe(401);
    expect(runWorkflowTimerCron).not.toHaveBeenCalled();
  });
});
