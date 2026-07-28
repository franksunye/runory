/**
 * Setup invoice module, create invoice data, and issue a customer access grant.
 *
 * This script:
 * 1. Installs the runory.invoice module
 * 2. Creates an invoice linked to quote Q-2026-009 and its work order
 * 3. Creates invoice line items
 * 4. Verifies the Stripe payment provider account
 * 5. Issues a customer access grant with all capabilities
 * 6. Prints the magic link
 *
 * Usage: npx tsx scripts/setup-invoice-and-grant.mts
 */
import { installModule, execute, queryOne, queryAll, batch, genId, now, TABLES, businessTable, repairWorkspaceCommandContracts, issueCustomerAccessGrant } from "@runory/platform-core";

const WORKSPACE_ID = "ws_aa0d5970-efa2-40cd-b8c5-6a223bcc4fef";
const QUOTE_ID = "rec_31e1e5a6-aa11-4cd7-a89d-a97c0b4dd644";
const WORK_ORDER_ID = "rec_10ac83e3-a4fe-4582-887d-6371c7f2236e";
const CONTACT_ID = "rec_af60b987-d0f1-4feb-ad80-7451292ea284";
const COMPANY_ID = "rec_d98948cd-4a2d-4449-af01-0812efc63df2";
const CURRENCY = "CNY";
const TOTAL_MINOR = 358400; // 3584.00 CNY (matching quote grand_total)
const PUBLIC_BASE_URL = "http://localhost:3000";

async function main() {
  console.log("=== Invoice Setup & Customer Access Grant ===\n");

  // 1. Install invoice module
  console.log("1. Installing runory.invoice module...");
  try {
    await installModule(WORKSPACE_ID, "runory.invoice");
    console.log("   ✓ Invoice module installed");
  } catch (err: any) {
    if (err.message?.includes("already installed") || err.message?.includes("ALREADY_INSTALLED")) {
      console.log("   ✓ Invoice module already installed");
    } else {
      throw err;
    }
  }

  // 2. Repair command contracts (to pick up invoice commands)
  console.log("2. Repairing command contracts...");
  await repairWorkspaceCommandContracts(WORKSPACE_ID);
  console.log("   ✓ Contracts repaired");

  // 3. Check if invoice already exists for this work order
  console.log("3. Checking for existing invoice...");
  const existing = await queryOne<{ id: string; invoice_number: string }>(
    `SELECT id, invoice_number FROM ${businessTable("invoice")}
     WHERE workspace_id = ? AND work_order_id = ?`,
    [WORKSPACE_ID, WORK_ORDER_ID],
  );

  let invoiceId: string;

  if (existing) {
    console.log(`   ✓ Existing invoice found: ${existing.invoice_number} (${existing.id})`);
    invoiceId = existing.id;
  } else {
    // Create invoice
    invoiceId = genId("rec");
    const invoiceNumber = `INV-2026-${String(Date.now()).slice(-3)}`;
    const ts = now();
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`   Creating invoice: ${invoiceNumber}`);
    await execute(
      `INSERT INTO ${businessTable("invoice")}
       (id, workspace_id, invoice_number, status, work_order_id, quote_id, company_id, contact_id,
        currency, total_minor, amount_paid_minor, balance_due_minor, issued_at, due_at, paid_at,
        voided_at, memo, source_snapshot_hash, created_by, aggregate_version, created_at, updated_at)
       VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, 'Payment due for services rendered', NULL, ?, 1, ?, ?)`,
      [invoiceId, WORKSPACE_ID, invoiceNumber, WORK_ORDER_ID, QUOTE_ID, COMPANY_ID, CONTACT_ID,
       CURRENCY, TOTAL_MINOR, TOTAL_MINOR, ts, dueAt, "usr_fe7628a7-8437-44ac-98ff-e58c9b066296", ts, ts],
    );
    console.log(`   ✓ Invoice created: ${invoiceNumber}`);

    // Create invoice lines (matching quote line items)
    const lineItems = [
      { desc: "Refrigeration Unit Inspection", qty: 1, unit: "service", price: 150000, total: 150000 },
      { desc: "Refrigerant Level Check & Top-up", qty: 1, unit: "service", price: 80000, total: 80000 },
      { desc: "Compressor Performance Test", qty: 1, unit: "service", price: 60000, total: 60000 },
      { desc: "Temperature Calibration", qty: 2, unit: "unit", price: 34200, total: 68400 },
    ];

    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const lineId = genId("rec");
      await execute(
        `INSERT INTO ${businessTable("invoice_line")}
         (id, workspace_id, invoice_id, description, quantity, unit, unit_price_minor, line_total_minor, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lineId, WORKSPACE_ID, invoiceId, li.desc, li.qty, li.unit, li.price, li.total, i, ts, ts],
      );
    }
    console.log(`   ✓ ${lineItems.length} invoice lines created`);
  }

  // 4. Verify Stripe payment provider account
  console.log("4. Verifying Stripe payment provider account...");
  const ppa = await queryOne<{ id: string; status: string; provider_account_ref: string }>(
    `SELECT id, status, provider_account_ref FROM ${businessTable("payment_provider_account")}
     WHERE workspace_id = ? AND provider = 'stripe' AND mode = 'test' AND status = 'active'`,
    [WORKSPACE_ID],
  );

  if (!ppa) {
    console.error("   ✗ No active Stripe test payment provider account found!");
    console.error("   Please set up Stripe Connect first via the billing page.");
    process.exit(1);
  }
  console.log(`   ✓ Stripe account: ${ppa.provider_account_ref} (${ppa.status})`);

  // 5. Check for existing payment request (source_object_type='invoice')
  console.log("5. Checking for existing payment request...");
  const existingReq = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${businessTable("payment_request")}
     WHERE workspace_id = ? AND source_object_type = 'invoice' AND source_object_id = ?`,
    [WORKSPACE_ID, invoiceId],
  );

  if (existingReq) {
    console.log(`   ✓ Existing payment request: ${existingReq.id} (${existingReq.status})`);
  } else {
    console.log("   (No payment request yet — will be created when customer clicks 'Pay now')");
  }

  // 6. Issue customer access grant via API (dev bootstrap provides admin permissions)
  console.log("6. Issuing customer access grant via API...");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const grantResponse = await fetch(
    `${PUBLIC_BASE_URL}/api/workspaces/${WORKSPACE_ID}/customer-access/grants`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
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
    console.error("   ✗ Failed to issue grant:", grantJson);
    process.exit(1);
  }

  const { grant, accessUrl } = grantJson.data;

  console.log("\n=== Grant Issued Successfully ===\n");
  console.log(`Grant ID:     ${grant.id}`);
  console.log(`Status:       ${grant.status}`);
  console.log(`Expires:      ${grant.expires_at}`);
  console.log(`Capabilities: ${grant.capabilities.join(", ")}`);

  // Extract token from accessUrl
  const url = new URL(accessUrl);
  const token = url.hash;

  console.log(`\n=== Customer Access URLs ===\n`);
  console.log("Chinese portal:");
  console.log(`  ${PUBLIC_BASE_URL}/zh/access${token}`);
  console.log("\nEnglish portal:");
  console.log(`  ${PUBLIC_BASE_URL}/en/access${token}`);
  console.log("\nOpen one of these URLs in your browser to start the walkthrough.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
