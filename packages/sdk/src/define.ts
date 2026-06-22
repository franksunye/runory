import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
} from "@runory/contracts";

// defineModule: typed facade for authoring a Module manifest
export function defineModule(config: ModuleManifest): ModuleManifest {
  return moduleManifestSchema.parse(config);
}

// definePack: typed facade for authoring a Pack manifest
export function definePack(config: PackManifest): PackManifest {
  return packManifestSchema.parse(config);
}

// defineTemplate: typed facade for authoring a Template manifest
export function defineTemplate(config: TemplateManifest): TemplateManifest {
  return templateManifestSchema.parse(config);
}

// defineConfig: project configuration
export interface SdkConfig {
  itemType: "module" | "pack" | "template";
  entry: string;
  migrations?: string;
  fixtures?: string;
  tests?: string;
  targetCore: string;
}

export function defineConfig(config: SdkConfig): SdkConfig {
  return config;
}
