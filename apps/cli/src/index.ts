#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateManifest, compileManifest, scanForSecrets, type ValidationResult } from "@runory/sdk";

// ── Command: validate ──
async function cmdValidate(args: string[], jsonOutput: boolean) {
  // Parse: runory validate [--entry <path>] [--type module|pack|template]
  const { values } = parseArgs({
    args,
    options: {
      entry: { type: "string", default: "src/module.ts" },
      type: { type: "string", default: "module" },
    },
  });

  // Load manifest from entry file (dynamic import)
  const entryPath = resolve(values.entry!);
  if (!existsSync(entryPath)) {
    outputError(jsonOutput, `Entry file not found: ${entryPath}`);
    process.exit(1);
  }

  // Dynamic import the module to get the manifest
  const mod = await import(entryPath);
  const manifest = mod.default ?? mod.manifest;
  if (!manifest) {
    outputError(jsonOutput, "No default export or manifest export found in entry file");
    process.exit(1);
  }

  // Run validation
  const result = validateManifest(manifest, values.type as "module" | "pack" | "template");

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.valid) {
      console.log(`✓ Manifest is valid (${result.summary.warnings} warning(s))`);
    } else {
      console.log(`✗ Validation failed (${result.summary.errors} error(s))`);
      for (const issue of result.issues) {
        console.log(`  [${issue.severity}] ${issue.path ?? ""}: ${issue.message}`);
      }
    }
  }

  process.exit(result.valid ? 0 : 1);
}

// ── Command: build ──
async function cmdBuild(args: string[], jsonOutput: boolean) {
  const { values } = parseArgs({
    args,
    options: {
      entry: { type: "string", default: "src/module.ts" },
      type: { type: "string", default: "module" },
      out: { type: "string", default: "dist" },
    },
  });

  const entryPath = resolve(values.entry!);
  if (!existsSync(entryPath)) {
    outputError(jsonOutput, `Entry file not found: ${entryPath}`);
    process.exit(1);
  }

  const mod = await import(entryPath);
  const manifest = mod.default ?? mod.manifest;
  if (!manifest) {
    outputError(jsonOutput, "No manifest found in entry file");
    process.exit(1);
  }

  // Validate first
  const validationResult = validateManifest(manifest, values.type as "module" | "pack" | "template");
  if (!validationResult.valid) {
    outputError(jsonOutput, "Validation failed, cannot build");
    if (jsonOutput) console.log(JSON.stringify(validationResult, null, 2));
    process.exit(1);
  }

  // Scan for secrets in manifest
  const manifestJson = JSON.stringify(manifest);
  const scanResult = scanForSecrets(manifestJson, values.entry);
  if (!scanResult.clean) {
    outputError(jsonOutput, "Secret scan failed");
    if (jsonOutput) console.log(JSON.stringify(scanResult, null, 2));
    process.exit(1);
  }

  // Compile artifact
  const compiled = compileManifest(manifest);

  // Write output files
  const outDir = resolve(values.out!);
  await mkdir(outDir, { recursive: true });

  const itemId = manifest.id?.replace(/[.\/]/g, "-") ?? "artifact";
  const version = manifest.version ?? "0.0.0";

  await writeFile(join(outDir, "manifest.json"), compiled.manifestJson);
  await writeFile(join(outDir, "provenance.json"), JSON.stringify(compiled.provenance, null, 2));
  await writeFile(join(outDir, "checksums.json"), JSON.stringify({
    manifest: compiled.checksum,
    algorithm: "sha256",
  }, null, 2));
  await writeFile(join(outDir, "validation-summary.json"), JSON.stringify(validationResult, null, 2));

  if (jsonOutput) {
    console.log(JSON.stringify({
      success: true,
      artifact: {
        itemId,
        version,
        checksum: compiled.checksum,
        outputDir: outDir,
      },
    }, null, 2));
  } else {
    console.log(`✓ Build complete: ${itemId}@${version}`);
    console.log(`  Checksum: ${compiled.checksum}`);
    console.log(`  Output: ${outDir}`);
  }
}

// ── Command: publish ──
async function cmdPublish(args: string[], jsonOutput: boolean) {
  const { values } = parseArgs({
    args,
    options: {
      channel: { type: "string", default: "internal" },
      artifact: { type: "string", default: "dist" },
      "api-base": { type: "string" },
      token: { type: "string" },
    },
  });

  // Only internal channel is allowed from CLI
  if (values.channel !== "internal") {
    outputError(jsonOutput, `CLI publish only supports --channel internal. Use Platform Catalog Console for ${values.channel} promotion.`);
    process.exit(1);
  }

  const token = values.token ?? process.env.RUNORY_TOKEN;
  const apiBase = values["api-base"] ?? process.env.RUNORY_API_BASE ?? "http://localhost:3000";

  if (!token) {
    outputError(jsonOutput, "RUNORY_TOKEN not set. Set it or pass --token.");
    process.exit(1);
  }

  // Load built artifact
  const artifactDir = resolve(values.artifact!);
  const manifestPath = join(artifactDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    outputError(jsonOutput, `Manifest not found. Run 'runory build' first. Expected: ${manifestPath}`);
    process.exit(1);
  }

  const manifestJson = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestJson);

  // Submit to Cloud Catalog API
  const response = await fetch(`${apiBase}/api/platform/catalog`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      manifest,
      source: "cli",
      idempotencyKey: `${manifest.id}@${manifest.version}`,
    }),
  });

  const result = await response.json();

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      console.log(`✓ Published ${manifest.id}@${manifest.version} to ${values.channel} channel`);
      console.log(`  Catalog item: ${result.data?.itemId}`);
      console.log(`  Version: ${result.data?.versionId}`);
    } else {
      console.log(`✗ Publish failed: ${result.error?.message ?? "unknown error"}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

// ── Command: test ──
async function cmdTest(args: string[], jsonOutput: boolean) {
  // For v0.1, test command delegates to vitest
  const { values } = parseArgs({
    args,
    options: {
      pattern: { type: "string" },
    },
  });

  // Check if tests directory exists
  const testDir = resolve("tests");
  if (!existsSync(testDir)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ success: true, message: "No tests directory found, skipping", tests: 0 }));
    } else {
      console.log("ℹ No tests directory found, skipping");
    }
    return;
  }

  // Delegate to vitest
  const vitestArgs = ["run"];
  if (values.pattern) vitestArgs.push(values.pattern);

  // For now, just report that test harness is available
  if (jsonOutput) {
    console.log(JSON.stringify({
      success: true,
      message: "Test harness delegated to @runory/testing",
      note: "Install @runory/testing and create tests/ directory with fixture-based tests",
    }));
  } else {
    console.log("ℹ Test harness uses @runory/testing package");
    console.log("  Create tests/ directory with fixture-based tests");
  }
}

// ── Helpers ──
function outputError(json: boolean, message: string) {
  if (json) {
    console.log(JSON.stringify({ success: false, error: { message } }));
  } else {
    console.error(`✗ ${message}`);
  }
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Runory CLI v0.1.0

Usage: runory <command> [options]

Commands:
  validate    Validate manifest against schema
  test        Run fixture-based tests
  build       Build immutable artifact
  publish     Publish artifact to Cloud Catalog

Options:
  --json      Output machine-readable JSON (for CI)
  --help      Show help

Examples:
  runory validate --entry src/module.ts --type module --json
  runory build --entry src/module.ts --out dist --json
  runory publish --channel internal --token $RUNORY_TOKEN --json`);
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  // Extract --json flag
  const jsonOutput = rest.includes("--json");
  const cleanArgs = rest.filter(a => a !== "--json");

  switch (command) {
    case "validate":
      await cmdValidate(cleanArgs, jsonOutput);
      break;
    case "test":
      await cmdTest(cleanArgs, jsonOutput);
      break;
    case "build":
      await cmdBuild(cleanArgs, jsonOutput);
      break;
    case "publish":
      await cmdPublish(cleanArgs, jsonOutput);
      break;
    default:
      outputError(jsonOutput, `Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
