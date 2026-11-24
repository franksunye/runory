import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

describe("middleware provider callbacks", () => {
  it("allows Stripe's signed webhook request without a browser Origin header", () => {
    const response = middleware(new NextRequest(
      "http://localhost:3001/api/integrations/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=test" },
        body: "{}",
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows Runory's Stripe Billing webhook without a browser Origin header", () => {
    const response = middleware(new NextRequest(
      "http://localhost:3001/api/integrations/stripe/billing-webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=test" },
        body: "{}",
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("continues to reject ordinary state changes without CSRF headers", async () => {
    const response = middleware(new NextRequest(
      "http://localhost:3001/api/workspaces/ws_123/payments/requests",
      { method: "POST", body: "{}" },
    ));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Origin or X-Requested-With header",
    });
  });

  it("allows the exact Connect callback, but not a sibling route, without browser CSRF headers", () => {
    const request = (path: string) => new NextRequest(`http://localhost:3001${path}`, {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=test" },
      body: "{}",
    });
    const callback = middleware(request("/api/integrations/stripe/connect-webhook"));
    expect(callback.headers.get("x-middleware-next")).toBe("1");
    expect(middleware(request("/api/integrations/stripe/connect-webhook/other")).status).toBe(403);
  });
});
