import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRequestActor } from "./auth";

const TRUST_ENV_KEYS = [
  "PLATFORM_TRUST_IDENTITY_HEADERS",
  "RUNORY_TRUST_IDENTITY_HEADERS",
  "PLATFORM_TRUST_PROXY_VERIFIED",
  "PLATFORM_DEV_BOOTSTRAP",
] as const;

const originalEnv = Object.fromEntries(
  TRUST_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof TRUST_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of TRUST_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function identityHeaderRequest() {
  return new NextRequest("https://runory.example/api/workspaces/example", {
    headers: {
      "x-platform-user-id": "spoofed-user",
      "x-platform-user-email": "spoofed@example.com",
      "x-platform-user-name": "Spoofed User",
    },
  });
}

describe("trusted identity proxy boundary", () => {
  it("rejects identity headers unless the proxy verification is explicitly confirmed", async () => {
    process.env.PLATFORM_TRUST_IDENTITY_HEADERS = "true";
    delete process.env.PLATFORM_TRUST_PROXY_VERIFIED;
    delete process.env.PLATFORM_DEV_BOOTSTRAP;

    await expect(getRequestActor(identityHeaderRequest())).rejects.toMatchObject({
      name: "AuthenticationError",
      message: "Authentication is required",
    });
  });

  it("accepts identity headers only behind an explicitly verified proxy", async () => {
    process.env.PLATFORM_TRUST_IDENTITY_HEADERS = "true";
    process.env.PLATFORM_TRUST_PROXY_VERIFIED = "true";
    delete process.env.PLATFORM_DEV_BOOTSTRAP;

    await expect(getRequestActor(identityHeaderRequest())).resolves.toEqual({
      externalId: "spoofed-user",
      email: "spoofed@example.com",
      displayName: "Spoofed User",
    });
  });
});
