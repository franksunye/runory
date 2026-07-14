import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = join(ROOT, "docs");
const ENTRY = join(DOCS_ROOT, "README.md");
const ALLOWED_STATUS = new Set(["canonical", "active", "proposed", "historical", "evidence"]);
const ALLOWED_TOPICS = new Set([
  "product",
  "workspace",
  "fsm",
  "architecture",
  "customization",
  "identity",
  "catalog",
  "operations",
  "releases",
  "documentation-governance",
]);

const errors = [];
const warnings = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "coverage"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") files.push(full);
  }
  return files;
}

function repoPath(file) {
  return relative(ROOT, file).split(sep).join("/");
}

function parseLinks(content) {
  const links = [];
  const prose = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const regex = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of prose.matchAll(regex)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    links.push(target);
  }
  return links;
}

function resolveMarkdownTarget(source, target) {
  const withoutFragment = decodeURIComponent(target.split("#")[0]);
  if (!withoutFragment) return null;
  const candidate = resolve(dirname(source), withoutFragment);
  const options = [candidate];
  if (!extname(candidate)) options.push(`${candidate}.md`, join(candidate, "README.md"));
  for (const option of options) {
    if (existsSync(option)) return normalize(option);
  }
  return normalize(candidate);
}

function parseMetadata(content) {
  const lines = content.split(/\r?\n/).slice(0, 40);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^\|\s*(Status|Topic|Applies to|Owner|Last reviewed|Supersedes|Superseded by)\s*\|\s*(.*?)\s*\|$/i);
    if (match) values[match[1].toLowerCase()] = match[2].replace(/`/g, "").trim();
  }
  return values;
}

function changedMarkdownFiles() {
  const base = process.env.DOCS_BASE_REF;
  const attempts = base
    ? [["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]]
    : [["diff", "--name-only", "--diff-filter=ACMR", "HEAD^", "HEAD"]];
  for (const args of attempts) {
    try {
      const output = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return new Set(output.split(/\r?\n/).filter((p) => p.endsWith(".md") && p.startsWith("docs/")));
    } catch {
      // Shallow or initial checkouts may not expose a comparison base.
    }
  }
  return new Set();
}

if (!existsSync(ENTRY)) errors.push("docs/README.md is required as the documentation entry point.");

const markdownFiles = walk(ROOT);
const docsFiles = markdownFiles.filter((file) => file.startsWith(`${DOCS_ROOT}${sep}`));
const fileSet = new Set(markdownFiles.map(normalize));
const graph = new Map();
const metadataByFile = new Map();

for (const file of markdownFiles) {
  const content = readFileSync(file, "utf8");
  metadataByFile.set(normalize(file), parseMetadata(content));
  const targets = [];
  for (const link of parseLinks(content)) {
    const resolved = resolveMarkdownTarget(file, link);
    if (!resolved) continue;
    if (!existsSync(resolved)) {
      errors.push(`${repoPath(file)}: broken relative link -> ${link}`);
      continue;
    }
    if (lstatSync(resolved).isDirectory()) continue;
    if (extname(resolved).toLowerCase() === ".md" && fileSet.has(resolved)) targets.push(resolved);
  }
  graph.set(normalize(file), targets);
}

const reachable = new Set();
const queue = existsSync(ENTRY) ? [normalize(ENTRY)] : [];
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const target of graph.get(file) ?? []) {
    if (target.startsWith(`${DOCS_ROOT}${sep}`) && !reachable.has(target)) queue.push(target);
  }
}

for (const file of docsFiles) {
  if (!reachable.has(normalize(file))) warnings.push(`${repoPath(file)} is not reachable from docs/README.md.`);
}

const changed = changedMarkdownFiles();
const canonicalByTopic = new Map();
for (const file of docsFiles) {
  const path = repoPath(file);
  const metadata = metadataByFile.get(normalize(file)) ?? {};
  const hasGovernanceMetadata = Boolean(metadata.status || metadata.topic);

  if (metadata.status && !ALLOWED_STATUS.has(metadata.status)) errors.push(`${path}: invalid Status '${metadata.status}'.`);
  if (metadata.topic && !ALLOWED_TOPICS.has(metadata.topic)) errors.push(`${path}: invalid Topic '${metadata.topic}'.`);
  if (metadata["last reviewed"] && !/^\d{4}-\d{2}-\d{2}$/.test(metadata["last reviewed"])) {
    errors.push(`${path}: Last reviewed must use YYYY-MM-DD.`);
  }

  if (metadata.status === "canonical") {
    if (!metadata.topic) errors.push(`${path}: canonical documents require Topic metadata.`);
    const list = canonicalByTopic.get(metadata.topic) ?? [];
    list.push(path);
    canonicalByTopic.set(metadata.topic, list);
  }

  if ((path.includes("/releases/") || /report|evidence|drill|e2e-run/i.test(path)) && metadata.status === "canonical") {
    errors.push(`${path}: evidence-like documents cannot be canonical.`);
  }

  if (changed.has(path) && path !== "docs/README.md") {
    const required = ["status", "topic", "applies to", "owner", "last reviewed", "supersedes", "superseded by"];
    const missing = required.filter((key) => !metadata[key]);
    if (missing.length) errors.push(`${path}: changed governed document is missing metadata: ${missing.join(", ")}.`);
  } else if (!hasGovernanceMetadata) {
    warnings.push(`${path}: legacy document has not yet been materially reviewed for metadata migration.`);
  }
}

for (const [topic, files] of canonicalByTopic) {
  if (topic && files.length > 1) errors.push(`Topic '${topic}' has multiple canonical documents: ${files.join(", ")}`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`\nDocumentation governance failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`Documentation governance passed for ${docsFiles.length} docs Markdown files (${warnings.length} warning(s)).`);
