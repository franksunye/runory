/**
 * Retrieve the completed checkout session from Stripe and forward a
 * checkout.session.completed event to the local connect-webhook endpoint.
 *
 * This simulates what Stripe would do if a webhook was configured.
 */
const { createClient } = require("@libsql/client");
const Stripe = require("stripe");
const { readFileSync } = require("fs");
const { resolve } = require("path");
const crypto = require("crypto");

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
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  appInfo: { name: "Runory", version: "0.5" },
});

const CHECKOUT_SESSION_ID = "cs_test_a1Je1N6xKfSIcQ5cf8irOlqzBHGh6dZoKgB8zTwrAQB6jvvHN1ESzvgtb9";
const WEBHOOK_URL = "http://localhost:3000/api/integrations/stripe/connect-webhook";
const WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

async function main() {
  console.log("1. Retrieving checkout session from Stripe...");
  const session = await stripe.checkout.sessions.retrieve(CHECKOUT_SESSION_ID);
  console.log("   Session status:", session.status);
  console.log("   Payment status:", session.payment_status);
  console.log("   Payment intent:", session.payment_intent);
  console.log("   Amount total:", session.amount_total);
  console.log("   Currency:", session.currency);
  console.log("   Metadata:", JSON.stringify(session.metadata));

  if (session.payment_status !== "paid") {
    console.error("   ✗ Checkout session is not paid! Cannot trigger payment.succeeded event.");
    process.exit(1);
  }

  // Construct the event payload (mimics what Stripe sends)
  const event = {
    id: "evt_" + Date.now() + "_manual_replay",
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    livemode: false,
    account: process.env.STRIPE_ACCOUNT_ID,
    data: {
      object: {
        id: session.id,
        object: "checkout.session",
        payment_status: session.payment_status,
        payment_intent: session.payment_intent,
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        status: session.status,
      },
    },
  };

  console.log("\n2. Constructed event payload");

  // Sign the payload manually using HMAC-SHA256 (same as Stripe's signature)
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  console.log("\n3. Sending event to webhook endpoint...");
  console.log("   URL:", WEBHOOK_URL);

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": header,
      "Origin": "http://localhost:3000",
    },
    body: payload,
  });

  const result = await response.json();
  console.log("\n4. Response status:", response.status);
  console.log("   Response body:", JSON.stringify(result, null, 2));

  if (response.ok && result.processed) {
    console.log("\n✓ Webhook event processed successfully!");
    console.log("  Payment and invoice status should now be updated.");
  } else if (response.ok && result.deduplicated) {
    console.log("\n✓ Event was already processed (deduplicated).");
  } else {
    console.log("\n✗ Event processing failed or was not processed.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
