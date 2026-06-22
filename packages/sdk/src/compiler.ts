import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdkVersion = require("../package.json").version as string;

export interface CompiledArtifact {
  manifest: Record<string, unknown>;
  manifestJson: string;
  checksum: string;
  provenance: {
    sdkVersion: string;
    compiledAt: string;
    manifestSchemaVersion: string;
  };
}

// Canonical serialization: sort keys deeply for deterministic output
function canonicalize(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function compileManifest(manifest: Record<string, unknown>): CompiledArtifact {
  const canonical = canonicalize(manifest) as Record<string, unknown>;
  const manifestJson = JSON.stringify(canonical);
  const checksum = createHash("sha256").update(manifestJson).digest("hex");

  // Reproducible builds: honor SOURCE_DATE_EPOCH (seconds since unix epoch)
  // when present, so compiledAt is deterministic across builds.
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  const compiledAt = sourceDateEpoch
    ? new Date(Number(sourceDateEpoch) * 1000).toISOString()
    : new Date().toISOString();

  return {
    manifest: canonical,
    manifestJson,
    checksum,
    provenance: {
      sdkVersion,
      compiledAt,
      manifestSchemaVersion:
        (manifest as { manifestSchemaVersion?: string }).manifestSchemaVersion ?? "1.0.0",
    },
  };
}
