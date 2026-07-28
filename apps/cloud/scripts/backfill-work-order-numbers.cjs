/**
 * Backfill work_order_number for all existing work orders that have NULL.
 *
 * Generates a human-readable number based on the work order's creation date
 * and record ID suffix, following the same pattern as generateWorkOrderNumber().
 *
 * Usage: node scripts/backfill-work-order-numbers.cjs
 */
const { createClient } = require("@libsql/client");
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

const db = createClient({ url: process.env.LIBSQL_URL });

function generateNumber(recordId, createdAt) {
  const dateStr = (createdAt || new Date().toISOString()).slice(0, 10).replaceAll("-", "");
  const suffix = recordId.slice(-8).toUpperCase();
  return `WO-${dateStr}-${suffix}`;
}

async function main() {
  console.log("=== Backfill Work Order Numbers ===\n");

  // Find all work orders with NULL work_order_number
  const result = await db.execute(
    `SELECT id, title, created_at FROM runory_business_work_order
     WHERE work_order_number IS NULL OR work_order_number = ''`
  );

  console.log(`Found ${result.rows.length} work orders without a number.\n`);

  if (result.rows.length === 0) {
    console.log("All work orders already have numbers. Nothing to do.");
    return;
  }

  let updated = 0;
  for (const row of result.rows) {
    const number = generateNumber(row.id, row.created_at);
    await db.execute({
      sql: `UPDATE runory_business_work_order SET work_order_number = ?, updated_at = ? WHERE id = ? AND (work_order_number IS NULL OR work_order_number = '')`,
      args: [number, new Date().toISOString(), row.id],
    });
    console.log(`  ✓ ${row.id} → ${number} (${row.title})`);
    updated++;
  }

  console.log(`\n✓ Backfilled ${updated} work order numbers.`);

  // Verify
  const remaining = await db.execute(
    `SELECT COUNT(*) as count FROM runory_business_work_order
     WHERE work_order_number IS NULL OR work_order_number = ''`
  );
  console.log(`Remaining without number: ${remaining.rows[0].count}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
