import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { ModuleTestHarness } from "./harness.js"
import {
  loadModuleManifest,
  loadPackManifest,
  createRecord,
  applyExtension,
  getFields,
  getRecords,
} from "@runory/platform-core"
import type { ExtensionPlan, ModuleManifest } from "@runory/contracts"

// ── Extension plan: add `tier` custom field to customer ──
const tierExtensionPlan: ExtensionPlan = {
  name: "Customer Tier Extension",
  description: "Add tier custom field to customer",
  targetModules: ["runory.customer"],
  riskLevel: "low",
  customFields: [
    {
      targetObject: "customer",
      fieldKey: "tier",
      label: "客户等级",
      type: "select",
      ownership: "workspace_extension",
      required: false,
      validation: { options: ["bronze", "silver", "gold", "platinum"] },
      ui: { listColumn: true, slot: "customer.form.basic_fields.after", order: 50 },
    },
  ],
}

describe("Customer 1.0 → 1.1 upgrade (SDK fixture test)", () => {
  let harness: ModuleTestHarness
  let workspaceId: string
  let customerV11Manifest: ModuleManifest
  let customerV10Manifest: ModuleManifest

  beforeAll(async () => {
    // Load 1.1 manifest from typed source (defineModule)
    const mod = await import(
      "../../../catalog/modules/runory.customer/v1.1/src/module.ts"
    )
    customerV11Manifest = mod.default as ModuleManifest

    // Load 1.0 manifest from YAML (via platform-core installer)
    customerV10Manifest = loadModuleManifest("runory.customer")

    // Load pack manifest
    const packManifest = loadPackManifest("crm-lite-pack")

    workspaceId = `ws_test_upgrade_${randomUUID()}`

    harness = new ModuleTestHarness({
      module: customerV11Manifest,
      previous: customerV10Manifest,
      pack: packManifest,
      workspaceId,
    })

    // Reset DB caches so the harness's temp database is used fresh
    const g = globalThis as Record<string, unknown>
    g.__platformDb = undefined
    g.__platformSchemaReady = undefined
    g.__platformMigrationsRun = undefined

    // Step 1: Setup — create temp database, run platform migrations
    await harness.setup()

    // Step 2: Install crm-lite-pack (installs runory.customer 1.0.0 + runory.contact)
    await harness.install()

    // Step 3: Seed customer records via createRecord
    await createRecord(workspaceId, "customer", {
      name: "Acme Corp",
      email: "acme@test.local",
      phone: "+1234567890",
    })
    await createRecord(workspaceId, "customer", {
      name: "Globex Inc",
      email: "globex@test.local",
      phone: "+1987654321",
    })
    await createRecord(workspaceId, "customer", {
      name: "Initech LLC",
      email: "initech@test.local",
      phone: "+15551234567",
    })

    // Step 4: Apply workspace extension (add tier custom field)
    await applyExtension(workspaceId, tierExtensionPlan, "test-harness")
  })

  afterAll(async () => {
    // Step 10: Cleanup
    await harness.cleanup()
  })

  // Step 5: Verify extension field exists in schema
  it("workspace extension field 'tier' exists in customer schema", async () => {
    const fields = await getFields(workspaceId, "customer")
    const tierField = fields.find((f) => f.fieldKey === "tier")
    expect(tierField).toBeDefined()
    expect(tierField!.ownership).toBe("workspace_extension")
    expect(tierField!.type).toBe("select")
  })

  // Step 6: Plan upgrade to 1.1.0
  it("planUpgrade returns compatible status for 1.0 → 1.1", async () => {
    const result = await harness.planUpgrade()
    expect(result.status).toBe("compatible")
    expect(result.issues).toHaveLength(0)
  })

  // Step 7: Assert data preserved (records still exist)
  it("customer records preserved after upgrade plan", async () => {
    const preserved = await harness.assertDataPreserved("customer", 3)
    expect(preserved).toBe(true)

    const records = await getRecords(workspaceId, "customer")
    expect(records).toHaveLength(3)
    expect(records.some((r) => r.name === "Acme Corp")).toBe(true)
    expect(records.some((r) => r.name === "Globex Inc")).toBe(true)
    expect(records.some((r) => r.name === "Initech LLC")).toBe(true)
  })

  // Step 8: Assert extension still present
  it("workspace extension still present after upgrade plan", async () => {
    const fields = await getFields(workspaceId, "customer")
    const tierField = fields.find(
      (f) => f.fieldKey === "tier" && f.ownership === "workspace_extension",
    )
    expect(tierField).toBeDefined()
  })

  // Step 9: Assert permission boundary (module_owned vs workspace_extension)
  it("permission boundary enforced (module_owned vs workspace_extension)", async () => {
    const boundaryOk = await harness.assertPermissionBoundary()
    expect(boundaryOk).toBe(true)

    const fields = await getFields(workspaceId, "customer")
    const moduleOwned = fields.filter((f) => f.ownership === "module_owned")
    const workspaceExt = fields.filter(
      (f) => f.ownership === "workspace_extension",
    )

    // 1.0 module fields: name, email, phone (3 module_owned)
    expect(moduleOwned.length).toBe(3)
    // Extension field: tier (1 workspace_extension)
    expect(workspaceExt.length).toBe(1)

    // No field should have an ownership outside the two allowed values
    for (const f of fields) {
      expect(["module_owned", "workspace_extension"]).toContain(f.ownership)
    }
  })
})
