import { spawn, spawnSync } from "node:child_process";

const secretKey = process.env.RUNORY_BILLING_STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_test_")) {
  throw new Error("RUNORY_BILLING_STRIPE_SECRET_KEY must be a Stripe test key");
}

const endpoint = "http://localhost:3000/api/integrations/stripe/billing-webhook";
const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
].join(",");

const secretResult = spawnSync("stripe", [
  "listen",
  "--api-key", secretKey,
  "--print-secret",
], { encoding: "utf8" });
if (secretResult.status !== 0) {
  throw new Error(secretResult.stderr.trim() || "Unable to obtain Stripe CLI webhook secret");
}
const webhookSecret = secretResult.stdout.trim();
if (!webhookSecret.startsWith("whsec_")) throw new Error("Stripe CLI returned an invalid webhook secret");

const app = spawn("pnpm", ["run", "dev"], {
  stdio: "inherit",
  env: { ...process.env, RUNORY_BILLING_STRIPE_WEBHOOK_SECRET: webhookSecret },
});
const listener = spawn("stripe", [
  "listen",
  "--api-key", secretKey,
  "--forward-to", endpoint,
  "--events", events,
], { stdio: "inherit" });

function stop(signal = "SIGTERM") {
  if (!app.killed) app.kill(signal);
  if (!listener.killed) listener.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

const exitCode = await new Promise((resolve) => {
  app.on("exit", (code) => resolve(code ?? 1));
  listener.on("exit", (code) => resolve(code ?? 1));
});
stop();
process.exitCode = exitCode;
