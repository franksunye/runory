import { createHash } from "node:crypto";

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

  return {
    manifest: canonical,
    manifestJson,
    checksum,
    provenance: {
      sdkVersion: "0.1.0",
      compiledAt: new Date().toISOString(),
      manifestSchemaVersion:
        (manifest as { manifestSchemaVersion?: string }).manifestSchemaVersion ?? "1.0.0",
    },
  };
}
