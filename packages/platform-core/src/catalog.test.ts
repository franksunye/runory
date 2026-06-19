import { describe, expect, it } from "vitest";
import {
  loadModuleManifest,
  loadPackManifest,
  loadTemplateManifest,
} from "./installer";

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
