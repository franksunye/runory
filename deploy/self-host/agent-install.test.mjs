// Validate the actual published quick-start command rather than another
// hand-written approximation. Synthetic archive only; no downloads or Docker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const guide = await readFile(new URL("./AGENT-INSTALL.md", import.meta.url), "utf8");
const archive = "runory-self-host-linux-amd64.tar.gz";
const commands = guide.match(/With both files in a new directory, use Bash to verify the archive before extracting it:\n\n\x60\x60\x60bash\n([\s\S]*?)\n\x60\x60\x60/);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

test("Agent installation guide has a single ordered journey and executable verification block", () => {
  const headings = guide.split("\n").filter(line => /^##? /.test(line));
  assert.deepEqual(headings, [
    "# Runory — Field Service Operating System for the Agent Era",
    "## Decide whether this candidate fits",
    "## 1. Obtain an exact verified bundle",
    "## 2. Install on an owner-authorized host",
    "## 3. Establish owner session and scoped Agent access",
    "## 4. Verify and maintain",
  ]);
  assert.ok(commands?.[1], "missing archive verification block");
  assert.equal(guide.split("\n").filter(line=>line.startsWith("\x60\x60\x60")).length % 2, 0);
  for (const operation of ["load", "init OWNER_EMAIL", "start", "doctor", "code", "mcp"]) {
    assert.ok(guide.includes("runory.sh " + operation), "missing supported operation " + operation);
  }
});

async function fixture(t, mode) {
  const root = await mkdtemp(join(tmpdir(), "runory-agent-guide-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source = join(root,"source");
  await mkdir(source);
  const bytes = Buffer.from("synthetic release file\n");
  await writeFile(join(source,"release.json"),bytes);
  await writeFile(join(source,"SHA256SUMS"),digest(mode==="inner-tamper"?Buffer.from("different"):bytes)+"  release.json\n");
  execFileSync("tar",["-czf",join(root,archive),"-C",source,"release.json","SHA256SUMS"],{stdio:"pipe"});
  const actual = await readFile(join(root,archive));
  const checksum = digest(actual)+"  "+archive+"\n";
  await writeFile(join(root,"SHA256SUMS"), mode==="missing" ? digest(bytes)+"  unrelated.json\n" :
    mode==="duplicate" ? checksum+checksum : checksum);
  if(mode==="outer-tamper") await writeFile(join(root,archive),"invalid archive");
  return root;
}

test("the published commands verify and extract a complete synthetic archive",async t=>{
  const root=await fixture(t,"valid");
  const result=spawnSync("bash",["-c",commands[1]],{cwd:root,encoding:"utf8",timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(await readFile(join(root,"runory-bundle","release.json"),"utf8"),"synthetic release file\n");
});
for(const mode of ["missing","duplicate","outer-tamper"]){
  test("the published commands reject "+mode+" before extraction",async t=>{
    const root=await fixture(t,mode);
    const result=spawnSync("bash",["-c",commands[1]],{cwd:root,encoding:"utf8",timeout:10000});
    assert.notEqual(result.status,0);
    await assert.rejects(stat(join(root,"runory-bundle")), {code:"ENOENT"});
  });
}
test("the published commands reject invalid inner checksums",async t=>{
  const root=await fixture(t,"inner-tamper");
  const result=spawnSync("bash",["-c",commands[1]],{cwd:root,encoding:"utf8",timeout:10000});
  assert.notEqual(result.status,0);
});
