// CI harness only. Runs on a fresh host against the extracted artifact, with
// synthetic identity and business records. Never capture OTPs, keys, browser
// storage, provider bodies, raw error objects or screenshots in evidence.
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const requireMcp = createRequire(new URL("../../mcp/package.json", import.meta.url));
const { Client } = requireMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireMcp("@modelcontextprotocol/sdk/client/stdio.js");
const base = "http://localhost:3000";
const bundle = process.env.RUNORY_BUNDLE_DIR;
const commit = process.env.RUNORY_EXPECTED_COMMIT;
const imageId = process.env.RUNORY_EXPECTED_IMAGE_ID;
const artifactId = process.env.RUNORY_CANDIDATE_ARTIFACT_ID;
const reportPath = process.env.RUNORY_CONSUMER_REPORT;
const email = "bundle-owner@runory.invalid";
const companyName = "B1 distributed bundle synthetic customer";
let stage = "preconditions", browser, client, transport;
const checks = [];
const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
const pass = name => { checks.push(name); console.log(JSON.stringify({check:name,status:"PASS"})); };
function toolPayload(result) {
  assert(!result.isError && Array.isArray(result.content) && result.content[0]?.type === "text", "invalid_mcp_result");
  return JSON.parse(result.content[0].text);
}
try {
  assert(bundle && reportPath && /^[a-f0-9]{40}$/.test(commit ?? "") &&
    /^sha256:[a-f0-9]{64}$/.test(imageId ?? "") && /^\d+$/.test(artifactId ?? ""), "missing_release_context");
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({ locale:"en-US" });
  // No external images, analytics or other provider requests in the browser.
  await context.route("**/*", route => {
    try { if (new URL(route.request().url()).origin === base) return route.continue(); }
    catch {}
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  stage = "owner-browser-login";
  await page.goto(base + "/en/login", {waitUntil:"domcontentloaded"});
  await page.locator("#email").fill(email);
  const challengePromise = page.waitForResponse(r => r.url() === base + "/api/auth/request-otp" && r.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  const challengeResponse = await challengePromise;
  const challenge = await challengeResponse.json();
  assert(challengeResponse.ok() && challenge.success && challenge.data.delivery === "operator" &&
    !("devCode" in challenge.data), "operator_challenge_contract");
  await page.getByText("bash runory.sh code",{exact:true}).waitFor();
  // The pseudo-terminal represents the synthetic human owner in this test.
  // Real Agents must not retrieve or handle an owner's OTP.
  const privateCode = execFileSync("script",["-qec","bash runory.sh code","/dev/null"],{
    cwd:bundle, encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30_000,
  });
  const match = privateCode.match(/(?:^|\n)(\d{6})\r?(?:\n|$)/);
  assert(match, "terminal_otp_unavailable");
  await page.locator("#code").fill(match[1]);
  const loginPromise = page.waitForResponse(r => r.url() === base + "/api/auth/verify-otp" && r.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  const loginResponse = await loginPromise;
  assert(loginResponse.ok() && (await loginResponse.json()).success, "owner_login_failed");
  await page.waitForURL(url => !url.pathname.endsWith("/login"));
  await page.waitForLoadState("domcontentloaded");
  const browserIdentity = await page.evaluate(async () => (await fetch("/api/auth/me", { cache:"no-store" })).json());
  assert(browserIdentity.success && browserIdentity.data.authenticated && browserIdentity.data.principal.email === email, "browser_cookie_not_accepted_by_runtime");
  const cookies = await context.cookies(base);
  assert(cookies.some(c => c.name === "platform_session" && c.secure && c.httpOnly), "browser_cookie_not_secure");
  async function request(path,method="GET",body,expected=200) {
    const r = await context.request.fetch(base+path,{method,
      headers:{"X-Requested-With":"XMLHttpRequest","Content-Type":"application/json"},
      ...(body===undefined?{}:{data:body}),timeout:300_000,maxRedirects:0});
    const j = await r.json();
    assert(r.status()===expected && j.success===true, "unexpected_authorized_http_result");
    return j.data;
  }
  const me = await request("/api/auth/me");
  assert(me.authenticated && me.principal.email===email && me.workspaces.length===1 &&
    me.workspaces[0].organizationRole==="owner","owner_session_not_authorized");
  const workspaceId=me.workspaces[0].workspaceId;
  const workspaceSlug=me.workspaces[0].workspaceSlug ?? me.workspaces[0].slug;
  assert(workspaceId && workspaceSlug, "missing_workspace_identity");
  const ws="/api/workspaces/"+encodeURIComponent(workspaceId);
  pass("real_chromium_owner_login_secure_cookie");

  stage="bundle-pack-install";
  const available=await request(ws+"/packs");
  assert(available.length===2 && ["fsm-pack","sales-quote-pack"].every(id=>available.some(p=>p.packId===id&&!p.installed)), "bundled_catalog_scope");
  for(const id of ["fsm-pack","sales-quote-pack"])
    await request(ws+"/packs/"+id+"/install","POST",{includeDemoData:false},201);
  const record=await request(ws+"/objects/company/records","POST",{name:companyName,lifecycle_stage:"customer"},201);
  assert(record.id && record.name===companyName,"customer_creation_failed");
  pass("bundled_packs_and_first_business_record");

  stage="browser-business-readback";
  await page.goto(base+"/w/"+encodeURIComponent(workspaceSlug)+"/companies",{waitUntil:"domcontentloaded"});
  await page.getByText(companyName,{exact:true}).first().waitFor({timeout:60_000});
  pass("company_visible_in_browser");

  stage="bundled-mcp";
  const key=await request(ws+"/api-keys","POST",{name:"B1 bundle consumer read-only",scopes:["workspace:read"]},201);
  assert(key.token && key.id,"scoped_key_creation_failed");
  transport=new StdioClientTransport({command:"bash",args:["runory.sh","mcp"],cwd:bundle,
    env:{RUNORY_API_KEY:key.token,RUNORY_WORKSPACE_ID:workspaceId},stderr:"pipe"});
  transport.stderr?.on("data",()=>{});
  client=new Client({name:"runory-bundle-acceptance",version:"1.0.0"},{capabilities:{}});
  await client.connect(transport,{timeout:30_000});
  const {tools}=await client.listTools({}, {timeout:20_000});
  assert(["pack.list","record.list","extension.preview"].every(name=>tools.some(t=>t.name===name)), "missing_bundled_tools");
  const packs=toolPayload(await client.callTool({name:"pack.list",arguments:{}},undefined,{timeout:30_000}));
  assert(Array.isArray(packs)&&packs.length===2&&packs.every(p=>p.installed),"mcp_pack_readback_failed");
  const records=toolPayload(await client.callTool({name:"record.list",arguments:{objectKey:"company",search:companyName,limit:5}},undefined,{timeout:30_000}));
  assert(Array.isArray(records)&&records.some(r=>r.id===record.id&&r.name===companyName),"mcp_record_readback_failed");
  const denied=await client.callTool({name:"record.create",arguments:{objectKey:"company",data:JSON.stringify({name:"Denied"})}},undefined,{timeout:30_000});
  const denial=JSON.parse(denied.content[0].text);
  assert(!denial.id && (denied.isError||denial.success===false||denial.code||denial.error),"read_key_mutation_not_denied");
  await request(ws+"/api-keys/"+encodeURIComponent(key.id),"DELETE");
  const revoked=await client.callTool({name:"record.list",arguments:{objectKey:"company"}},undefined,{timeout:30_000});
  const rejected=JSON.parse(revoked.content[0].text);
  assert(!Array.isArray(rejected) && (revoked.isError||rejected.success===false||rejected.code||rejected.error),"revoked_key_not_denied");
  pass("bundled_stdio_mcp_scoped_readback_and_revocation");
  await writeFile(reportPath,JSON.stringify({format:"runory.self-host.bundle-consumer/v1",status:"PASS",
    sourceCommit:commit,imageId,candidateArtifactId:artifactId,checks,independentAgentTrial:false,
    browser:"chromium-localhost",providerAcceptance:false},null,2)+"\n",{flag:"wx",mode:0o600});
} catch {
  console.error(JSON.stringify({stage,status:"FAIL",checks}));
  process.exitCode=1;
} finally {
  if (client) await client.close().catch(()=>{});
  if (transport) await transport.close().catch(()=>{});
  if (browser) await browser.close().catch(()=>{});
}
