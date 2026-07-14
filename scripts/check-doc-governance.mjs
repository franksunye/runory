import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = join(ROOT, "docs");
const ENTRY = join(DOCS_ROOT, "README.md");
const BOOTSTRAP = new Set(["docs/README.md", "docs/document-governance.md"]);
const STATUSES = new Set(["canonical", "active", "proposed", "historical", "evidence"]);
const TOPICS = new Set([
  "product", "workspace", "fsm", "architecture", "customization",
  "identity", "catalog", "operations", "releases", "documentation-governance",
]);
const errors = [];
const warnings = [];

function walk(dir) {
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "coverage"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") output.push(full);
  }
  return output;
}

const repoPath = (file) => relative(ROOT, file).split(sep).join("/");

function addedDocs() {
  const base = process.env.DOCS_BASE_REF;
  const args = base
    ? ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`]
    : ["diff", "--name-only", "--diff-filter=A", "HEAD^", "HEAD"];
  try {
    const value = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return new Set(value.split(/\r?\n/).filter((p) => p.startsWith("docs/") && p.endsWith(".md")));
  } catch {
    return new Set();
  }
}

function metadata(content) {
  const result = {};
  for (const line of content.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\|\s*(Status|Topic|Applies to|Owner|Last reviewed|Supersedes|Superseded by)\s*\|\s*(.*?)\s*\|$/i);
    if (match) result[match[1].toLowerCase()] = match[2].replace(/`/g, "").trim();
  }
  return result;
}

function links(content) {
  const prose = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  return [...prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)]
    .map((m) => m[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0])
    .filter((value) => value && !value.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(value));
}

function targetPath(source, value) {
  let clean = value.split("#")[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    warnings.push(`${repoPath(source)}: malformed URL encoding in link -> ${value}`);
  }
  if (!clean) return null;
  const base = resolve(dirname(source), clean);
  return [base, `${base}.md`, join(base, "README.md")].find(existsSync) ?? base;
}

if (!existsSync(ENTRY)) errors.push("docs/README.md is required.");

const added = addedDocs();
const docs = walk(DOCS_ROOT);
const canonical = new Map();

for (const file of docs) {
  const path = repoPath(file);
  const content = readFileSync(file, "utf8");
  const meta = metadata(content);
  const strict = added.has(path) && !BOOTSTRAP.has(path);
  const report = (message) => (strict ? errors : warnings).push(`${path}: ${message}`);

  for (const link of links(content)) {
    const target = targetPath(file, link);
    if (target && !existsSync(target)) report(`broken relative link -> ${link}`);
  }

  if (meta.status && !STATUSES.has(meta.status)) report(`invalid Status '${meta.status}'.`);
  if (meta.topic && !TOPICS.has(meta.topic)) report(`invalid Topic '${meta.topic}'.`);
  if (meta["last reviewed"] && !/^\d{4}-\d{2}-\d{2}$/.test(meta["last reviewed"])) report("Last reviewed must use YYYY-MM-DD.");

  if (strict) {
    const required = ["status", "topic", "applies to", "owner", "last reviewed", "supersedes", "superseded by"];
    const missing = required.filter((key) => !meta[key]);
    if (missing.length) errors.push(`${path}: new governed document is missing metadata: ${missing.join(", ")}.`);
  }

  if (meta.status === "canonical" && !BOOTSTRAP.has(path)) {
    const list = canonical.get(meta.topic) ?? [];
    list.push({ path, strict });
    canonical.set(meta.topic, list);
  }

  if (!meta.status && !meta.topic) warnings.push(`${path}: legacy metadata migration pending.`);
}

for (const [topic, files] of canonical) {
  if (!topic || files.length < 2) continue;
  const message = `Topic '${topic}' has multiple canonical documents: ${files.map((f) => f.path).join(", ")}`;
  if (files.some((f) => f.strict)) errors.push(message);
  else warnings.push(message);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Documentation governance passed for ${docs.length} Markdown files with ${warnings.length} baseline warning(s).`);
