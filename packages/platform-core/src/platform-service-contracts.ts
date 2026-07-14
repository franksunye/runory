import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  platformServiceContractManifestSchema,
  type PlatformServiceContractManifest,
} from "@runory/contracts";
import { PLATFORM_SERVICES_DIR } from "./contracts";
import {
  getRegisteredCommandEffectProviders,
  syncWorkspaceCommandContracts,
  validatePlatformServiceCommandContracts,
} from "./command-contracts";

const manifestCache = new Map<string, PlatformServiceContractManifest>();

export function clearPlatformServiceContractCache(): void {
  manifestCache.clear();
}

export function loadPlatformServiceContractManifest(
  serviceId: string,
): PlatformServiceContractManifest {
  const cached = manifestCache.get(serviceId);
  if (cached) return cached;
  const path = resolve(PLATFORM_SERVICES_DIR, serviceId, "manifest.yaml");
  if (!existsSync(path)) throw new Error(`Platform Service manifest not found: ${path}`);
  const manifest = platformServiceContractManifestSchema.parse(
    parseYaml(readFileSync(path, "utf-8")),
  );
  if (manifest.id !== serviceId) {
    throw new Error(`Platform Service directory '${serviceId}' contains manifest '${manifest.id}'.`);
  }
  const issues = validatePlatformServiceCommandContracts(manifest, [
    ...getRegisteredCommandEffectProviders().map((provider) => ({
      capability: provider.capability,
      version: provider.version,
      consistency: provider.consistency,
    })),
    ...(manifest.domain.capabilities?.provides ?? []),
  ]);
  if (issues.length > 0) {
    throw new Error(
      `COMMAND_CONTRACT_INCOMPLETE: Platform Service '${serviceId}' is invalid: ${issues.join("; ")}`,
    );
  }
  manifestCache.set(serviceId, manifest);
  return manifest;
}

export function listPlatformServiceContractManifests(): PlatformServiceContractManifest[] {
  return readdirSync(PLATFORM_SERVICES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadPlatformServiceContractManifest(entry.name))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Install or repair the Platform Service snapshots for a workspace. */
export async function syncWorkspacePlatformServiceContracts(
  workspaceId: string,
): Promise<void> {
  for (const manifest of listPlatformServiceContractManifests()) {
    await syncWorkspaceCommandContracts(
      workspaceId,
      "platform_service",
      manifest.id,
      manifest.version,
      manifest.domain.commands,
    );
  }
}
