/**
 * Quick script to issue a customer access grant and print the magic link.
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const WORKSPACE_ID = "ws_aa0d5970-efa2-40cd-b8c5-6a223bcc4fef";
const QUOTE_ID = "rec_31e1e5a6-aa11-4cd7-a89d-a97c0b4dd644";
const CONTACT_ID = "rec_af60b987-d0f1-4feb-ad80-7451292ea284";
const PUBLIC_BASE_URL = "http://localhost:3000";

async function main() {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  console.log("Issuing customer access grant...");

  const grantResponse = await fetch(
    `${PUBLIC_BASE_URL}/api/workspaces/${WORKSPACE_ID}/customer-access/grants`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000",
        "x-dev-workspace-id": WORKSPACE_ID,
        "x-dev-user-id": "usr_fe7628a7-8437-44ac-98ff-e58c9b066296",
      },
      body: JSON.stringify({
        subjectType: "contact",
        subjectId: CONTACT_ID,
        rootObjectType: "quote",
        rootRecordId: QUOTE_ID,
        capabilities: [
          "quote.view",
          "quote.accept",
          "work_order.view_status",
          "service_report.view",
          "invoice.view",
          "invoice.pay",
          "payment.view_status",
        ],
        expiresAt,
      }),
    },
  );

  const grantJson = await grantResponse.json();
  if (!grantJson.success) {
    console.error("Failed to issue grant:", JSON.stringify(grantJson, null, 2));
    process.exit(1);
  }

  const { accessUrl } = grantJson.data;
  const url = new URL(accessUrl);
  const token = url.hash;

  console.log("\n=== Customer Access URLs ===\n");
  console.log("Chinese portal:");
  console.log(`  ${PUBLIC_BASE_URL}/zh/access${token}`);
  console.log("\nEnglish portal:");
  console.log(`  ${PUBLIC_BASE_URL}/en/access${token}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
