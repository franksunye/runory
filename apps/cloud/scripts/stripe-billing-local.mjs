import Stripe from "stripe";

const command = process.argv[2] ?? "verify";
const secretKey = process.env.RUNORY_BILLING_STRIPE_SECRET_KEY;

if (!secretKey) throw new Error("Missing dedicated RUNORY_BILLING_STRIPE_SECRET_KEY");
if (!secretKey.startsWith("sk_test_")) {
  throw new Error("Local billing setup only accepts a Stripe test-mode key");
}

const stripe = new Stripe(secretKey);
const catalog = [
  { id: "starter", name: "Runory Starter", amount: 44_900 },
  { id: "growth", name: "Runory Growth", amount: 99_900 },
  { id: "pro", name: "Runory Pro", amount: 249_900 },
];

async function findOrCreateProduct(plan) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) =>
    product.metadata.runory_catalog === "cloud_subscription"
    && product.metadata.runory_plan === plan.id,
  );
  if (existing) return existing;
  if (command !== "setup") throw new Error(`Missing Stripe test product for ${plan.id}`);
  return stripe.products.create({
    name: plan.name,
    description: `${plan.name} monthly subscription`,
    metadata: {
      runory_catalog: "cloud_subscription",
      runory_plan: plan.id,
    },
  }, { idempotencyKey: `runory-test-product-${plan.id}-v1` });
}

async function findOrCreatePrice(plan, productId) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find((price) =>
    price.currency === "usd"
    && price.unit_amount === plan.amount
    && price.recurring?.interval === "month",
  );
  if (existing) return existing;
  if (command !== "setup") throw new Error(`Missing Stripe test price for ${plan.id}`);
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: plan.amount,
    recurring: { interval: "month" },
    metadata: { runory_plan: plan.id },
  }, { idempotencyKey: `runory-test-price-${plan.id}-usd-month-v1` });
}

const account = await stripe.accounts.retrieve();
const expectedAccountId = process.env.RUNORY_BILLING_STRIPE_ACCOUNT_ID?.trim();
if (expectedAccountId && account.id !== expectedAccountId) {
  throw new Error(`Stripe account mismatch: expected ${expectedAccountId}, received ${account.id}`);
}
const resolved = {};
for (const plan of catalog) {
  const product = await findOrCreateProduct(plan);
  const price = await findOrCreatePrice(plan, product.id);
  resolved[plan.id] = { productId: product.id, priceId: price.id };
}

console.log(JSON.stringify({
  ok: true,
  mode: "test",
  accountId: account.id,
  plans: resolved,
}, null, 2));
