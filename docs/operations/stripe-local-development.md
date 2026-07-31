# Stripe Local Development

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `operations` |
| Applies to | `v0.9+` |
| Owner | Engineering / Operations |
| Last reviewed | 2026-07-29 |
| Supersedes | — |
| Superseded by | — |

Runory keeps two Stripe domains separate:

- **Runory SaaS billing** charges an Organization for Starter, Growth, or Pro.
- **Workspace payments / Connect** lets a merchant collect money from its customers.

Local development always uses Stripe test mode. Never place a live key in
`apps/cloud/.env.local`.

## One-time setup

1. Install and authenticate Stripe CLI (`stripe login`).
2. Put a dedicated Stripe test secret key in
   `RUNORY_BILLING_STRIPE_SECRET_KEY` in `apps/cloud/.env.local`. It must belong
   to the same Runory Stripe platform account used in production; do not reuse
   an unrelated Workspace-payment test account.
3. Set `RUNORY_BILLING_STRIPE_ACCOUNT_ID` to the expected Runory Stripe account
   ID so setup fails fast when credentials point at the wrong account.
4. Provision or verify the SaaS billing test catalog:

```bash
cd apps/cloud
pnpm stripe:billing:setup
pnpm stripe:billing:verify
```

The setup command is idempotent and creates the test-mode Starter ($449/month),
Growth ($999/month), and Pro ($2,499/month) products when missing. Copy the
reported Price IDs into the corresponding `RUNORY_BILLING_*_PRICE_ID` variables.

5. Configure Workspace customer payments (Demo Connect):

```bash
cd apps/cloud
# Requires Demo Workspace (pnpm bootstrap:demo) and STRIPE_SECRET_KEY=sk_test_...
# Uses STRIPE_CONNECT_ACCOUNT_ID when set; otherwise picks a charges_enabled connected account.
pnpm stripe:payments:setup
pnpm stripe:payments:verify
```

This installs `runory.payment` on Demo Workspace(s), maps a Connect-ready
provider account into the local DB, and rewrites:

- `STRIPE_PAYMENT_WORKSPACE_ID` → current Demo Workspace id
- `STRIPE_CONNECT_ACCOUNT_ID` → merchant Connected Account (`acct_...`)

Checkout uses Direct Charges on that Connected Account. A platform-only
`acct_` without Connect enrollment is not enough.

Restart `pnpm dev` after setup so the process picks up updated env values.

## Run the complete local flow

### SaaS billing

```bash
cd apps/cloud
pnpm dev:stripe
```

This starts Next.js and a Stripe CLI listener together. The listener forwards
only the six SaaS-billing events to:

```text
http://localhost:3000/api/integrations/stripe/billing-webhook
```

The CLI signing secret is injected only into the local Next.js process, so it
cannot drift from the active listener and does not need to be stored on disk.

### Workspace customer payments (Connect)

With `pnpm dev` already running and `stripe:payments:setup` completed:

```bash
stripe listen \
  --forward-to localhost:3000/api/integrations/stripe/connect-webhook \
  --events checkout.session.completed,payment_intent.succeeded,charge.refunded,account.updated
```

Copy the printed `whsec_...` into `STRIPE_CONNECT_WEBHOOK_SECRET` for that
terminal session (or restart the app with the injected secret). Then:

1. Issue an Invoice from a completed Work Order.
2. Click **Request payment** → Stripe Checkout opens.
3. Pay with `4242 4242 4242 4242`.
4. Confirm Invoice/Payment move to paid/succeeded after the forwarded webhook.

Use Stripe test card `4242 4242 4242 4242`, any future expiry, and any CVC.
Complete Checkout, then verify that the billing page reflects the signed
subscription event. Use the Customer Portal to exercise cancellation and
payment-method management.

## Safety and acceptance checks

- `RUNORY_BILLING_STRIPE_MODE=test` must match an `sk_test_` key.
- `STRIPE_PAYMENT_MODE=test` must match Workspace `STRIPE_SECRET_KEY=sk_test_...`.
- Browser requests submit `starter`, `growth`, or `pro`, never a Stripe Price ID.
- Webhook signature verification uses the raw request body.
- Replayed and out-of-order events must remain harmless.
- Production and local test products, keys, webhook secrets, customers, and
  subscriptions must never be mixed.
- SaaS billing webhooks and Connect payment webhooks stay on separate endpoints.