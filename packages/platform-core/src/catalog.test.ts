import { describe, expect, it } from "vitest";
import {
  loadModuleManifest,
  loadPackManifest,
  loadTemplateManifest,
} from "./installer";
import { createWorkspaceSlug } from "./metadata";

describe("official catalog", () => {
  it("loads and validates the CRM catalog", () => {
    const customer = loadModuleManifest("runory.customer");
    const contact = loadModuleManifest("runory.contact");
    const pack = loadPackManifest("crm-lite-pack");
    const template = loadTemplateManifest("small-business-crm");

    expect(customer.objects.map((object) => object.key)).toContain("customer");
    expect(contact.dependencies).toContain("runory.customer");
    expect(pack.modules).toContain("runory.customer:^1.0.0");
    expect(template.navigation).toContain("customers");
  });
});

describe("workspace slug", () => {
  it("creates a short ASCII route key", () => {
    const slug = createWorkspaceSlug(
      "我的客户工作区",
      "ws_cf5403fd-dd8b-4233-b7dd-755c8ca5923d"
    );

    expect(slug).toMatch(/^w-[a-z0-9]{10}$/);
    expect(slug.length).toBeLessThanOrEqual(32);
  });

  it("keeps a readable Latin name", () => {
    const slug = createWorkspaceSlug(
      "Acme Sales Team",
      "ws_cf5403fd-dd8b-4233-b7dd-755c8ca5923d"
    );

    expect(slug).toMatch(/^acme-sales-team-[a-z0-9]{10}$/);
  });
});
