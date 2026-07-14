import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = join(ROOT, "docs");
const ENTRY = join(DOCS_ROOT, "README.md");
const BOOTSTRAP_FILES = new Set(["docs/README.md", "docs/document-governance.md"]);
const ALLOWED_STATUS = new Set(["canonical", "active", "proposed", "historical", "evidence"]);
const ALLOWED_TOPICS = new Set([
  "product", "workspace", "fsm", "architecture", "customization",
  "identity", "catalog", "operations", "releases", "documentation-governance",
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

const repoPath = (file) => relative(ROOT, file).split(sep).join("/");

function addedMarkdownFiles() {
  const base = process.env.DOCS_BASE_REF;
  const args = base
    ? ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`]
    : ["diff", "--name-only", "--diff-filter=A", "HEAD^", "HEAD"];
  try {
    const output = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return new Set(output.split(/\r?\n/).filter((p) => p.endsWith(".md") && p.startsWith("docs/")));
  } catch {
    return new Set();
  }
}

function parseLinks(content) {
  const prose = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const links = [];
  for (const match of prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    links.push(target);
  }
  return links;
}

function resolveTarget(source, target) {
  const clean = decodeURIComponent(target.split("#")[0]);
  if (!clean) return null;
  const candidate = resolve(dirname(source), clean);
  return [candidate, `${candidate}.md`, join(candidate, "README.md")].find(existsSync) ?? candidate;
}

function parseMetadata(content) {
  const metadata = {};
  for (const line of content.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\|\s*(Status|Topic|Applies to|Owner|Last reviewed|Supersedes|Superseded by)\s*\|\s*(.*?)\s*\|$/i);
    if (match) metadata[match[1].toLowerCase()] = match[2].replace(/`/g, "").trim();
  }
  return metadata;
}

if (!existsSync(ENTRY)) errors.push("docs/README.md is required as the documentation entry point.");

const added = addedMarkdownFiles();
const markdownFiles = walk(ROOT);
const docsFiles = markdownFiles.filter((file) => file.startsWith(`${DOCS_ROOT}${sep}`));
const fileSet = new Set(markdownFiles.map(normalize));
const graph = new Map();
const metadataByFile = new Map();

for (const file of markdownFiles) {
  const path = repoPath(file);
  const content = readFileSync(file, "utf8");
  metadataByFile.set(normalize(file), parseMetadata(content));
  const targets = [];
  for (const link of parseLinks(content)) {
    const target = resolveTarget(file, link);
    if (!target || !existsSync(target)) {
      const message = `${path}: broken relative link -> ${link}`;
      if (added.has(path) && !BOOTSTRAP_FILES.has(path)) errors.push(message);
      else warnings.push(message);
      continue;
    }
    if (lstatSync(target).isDirectory()) continue;
    const normalized = normalize(target);
    if (extname(normalized).toLowerCase() === ".md" && fileSet.has(normalized)) targets.push(normalized);
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

const canonicalByTopic = new Map();
for (const file of docsFiles) {
  const path = repoPath(file);
  const metadata = metadataByFile.get(normalize(file)) ?? {};
  const isBootstrap = BOOTSTRAP_FILES.has(path);
  const isAdded = added.has(path) && !isBootstrap;
  const report = (message) => (isAdded ? errors : warnings).push(`${path}: ${message}`);

  if (metadata.status && !ALLOWED_STATUS.has(metadata.status)) report(`invalid Status '${metadata.status}'.`);
  if (metadata.topic && !ALLOWED_TOPICS.has(metadata.topic)) report(`invalid Topic '${metadata.topic}'.`);
  if (metadata["last reviewed"] && !/^\d{4}-\d{2}-\d{2}$/.test(metadata["last reviewed"])) report("Last reviewed must use YYYY-MM-DD.");

  if (metadata.status === "canonical" && !isBootstrap) {
    if (!metadata.topic) report("canonical documents require Topic metadata.");
    const list = canonicalByTopic.get(metadata.topic) ?? [];
    list.push({ path, isAdded });
    canonicalByTopic.set(metadata.topic, list);
  }

  if ((path.includes("/releases/") || /report|evidence|drill|e2e-run/i.test(path)) && metadata.status === "canonical") {
    report("evidence-like documents cannot be canonical.");
  }

  if (isAdded) {
    const required = ["status", "topic", "applies to", "owner", "last reviewed", "supersedes", "superseded by"];
    const missing = required.filter((key) => !metadata[key]);
    if (missing.length) errors.push(`${path}: new governed document is missing metadata: ${missing.join(", ")}.`);
  } else if (!metadata.status && !metadata.topic) {
    warnings.push(`${path}: legacy metadata migration pending until the next material edit.`);
  }
}

for (const [topic, files] of canonicalByTopic) {
  if (!topic || files.length <= 1) continue;
  const message = `Topic '${topic}' has multiple canonical documents: ${files.map((f) => f.path).join(", ")}`;
  if (files.some((f) => f.isAdded)) errors.push(message);
  else warnings.push(message);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`\nDocumentation governance failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`Documentation governance passed for ${docsFiles.length} docs Markdown files (${warnings.length} baseline warning(s)).`);
