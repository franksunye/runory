import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const resources = ["schema", "catalog"];
const dst = path.join(here, "../.resources");

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });

for (const dir of resources) {
  const src = path.join(repoRoot, dir);
  if (!fs.existsSync(src)) {
    console.error(`[sync-resources] missing: ${src}`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(dst, dir), { recursive: true });
  console.log(`[sync-resources] ${dir}/ → apps/cloud/.resources/${dir}/`);
}

console.log("[sync-resources] done");
