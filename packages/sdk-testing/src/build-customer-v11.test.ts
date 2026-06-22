import { describe, it, expect } from "vitest"
import { writeFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { validateManifest, compileManifest, scanForSecrets } from "@runory/sdk"
import type { ModuleManifest } from "@runory/contracts"

// Dist output directory (catalog/modules/runory.customer/v1.1/dist)
const DIST_DIR = resolve(
  import.meta.dirname,
  "../../../catalog/modules/runory.customer/v1.1/dist",
)

describe("Build runory.customer 1.1.0 artifact via SDK pipeline", () => {
  let manifest: ModuleManifest
  let compiled: ReturnType<typeof compileManifest>
  let validationResult: ReturnType<typeof validateManifest>
  let scanResult: ReturnType<typeof scanForSecrets>

  it("loads typed manifest from module.ts (defineModule source)", async () => {
    const mod = await import(
      "../../../catalog/modules/runory.customer/v1.1/src/module.ts"
    )
    manifest = mod.default
    expect(manifest).toBeDefined()
    expect(manifest.id).toBe("runory.customer")
    expect(manifest.version).toBe("1.1.0")
  })

  it("validates manifest against schema", () => {
    validationResult = validateManifest(manifest!, "module")
    expect(validationResult.valid).toBe(true)
    expect(validationResult.summary.errors).toBe(0)
  })

  it("scans manifest for secrets (clean)", () => {
    const manifestJson = JSON.stringify(manifest!)
    scanResult = scanForSecrets(manifestJson, "src/module.ts")
    expect(scanResult.clean).toBe(true)
    expect(scanResult.findings).toHaveLength(0)
  })

  it("compiles manifest to immutable artifact", () => {
    compiled = compileManifest(manifest! as unknown as Record<string, unknown>)
    expect(compiled.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(compiled.provenance.sdkVersion).toBe("0.1.0")
    expect(compiled.provenance.manifestSchemaVersion).toBe("1.0.0")
  })

  it("writes dist artifacts (manifest.json, provenance.json, checksums.json)", () => {
    mkdirSync(DIST_DIR, { recursive: true })

    writeFileSync(
      join(DIST_DIR, "manifest.json"),
      compiled.manifestJson,
    )
    writeFileSync(
      join(DIST_DIR, "provenance.json"),
      JSON.stringify(compiled.provenance, null, 2),
    )
    writeFileSync(
      join(DIST_DIR, "checksums.json"),
      JSON.stringify({
        manifest: compiled.checksum,
        algorithm: "sha256",
      }, null, 2),
    )
    writeFileSync(
      join(DIST_DIR, "validation-summary.json"),
      JSON.stringify(validationResult, null, 2),
    )
  })

  it("artifact contains 1.1 additions (industry + website fields)", () => {
    const parsed = JSON.parse(compiled.manifestJson)
    const fieldKeys = parsed.objects[0].fields.map((f: { key: string }) => f.key)
    expect(fieldKeys).toContain("industry")
    expect(fieldKeys).toContain("website")
    expect(fieldKeys).toContain("name")
    expect(fieldKeys).toContain("email")
    expect(fieldKeys).toContain("phone")
  })
})
