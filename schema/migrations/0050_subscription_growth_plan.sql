-- Add Growth to the Runory SaaS subscription and entitlement plan contracts.
-- SQLite CHECK constraints require table reconstruction.
-- Transaction: required

ALTER TABLE {{SAAS_TABLE_PREFIX}}organization_entitlements
  RENAME TO {{SAAS_TABLE_PREFIX}}organization_entitlements_0049;

CREATE TABLE {{SAAS_TABLE_PREFIX}}organization_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'early_access'
    CHECK(plan IN ('early_access','starter','growth','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','expired')),
  quotas_json TEXT NOT NULL,
  overrides_json TEXT NOT NULL DEFAULT '{}',
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO {{SAAS_TABLE_PREFIX}}organization_entitlements
  (id, organization_id, plan, status, quotas_json, overrides_json,
   effective_at, expires_at, created_at, updated_at)
SELECT id, organization_id, plan, status, quotas_json, overrides_json,
       effective_at, expires_at, created_at, updated_at
FROM {{SAAS_TABLE_PREFIX}}organization_entitlements_0049;

DROP TABLE {{SAAS_TABLE_PREFIX}}organization_entitlements_0049;
CREATE INDEX idx_entitlements_org
  ON {{SAAS_TABLE_PREFIX}}organization_entitlements(organization_id);

ALTER TABLE {{SAAS_TABLE_PREFIX}}subscriptions
  RENAME TO {{SAAS_TABLE_PREFIX}}subscriptions_0049;

CREATE TABLE {{SAAS_TABLE_PREFIX}}subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  billing_customer_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT NOT NULL UNIQUE,
  provider_price_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('starter','growth','pro','enterprise')),
  status TEXT NOT NULL CHECK(status IN (
    'incomplete','incomplete_expired','trialing','active','past_due',
    'canceled','unpaid','paused'
  )),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  current_period_start TEXT,
  current_period_end TEXT,
  grace_until TEXT,
  latest_invoice_id TEXT,
  last_provider_event_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO {{SAAS_TABLE_PREFIX}}subscriptions
  (id, organization_id, billing_customer_id, provider,
   provider_subscription_id, provider_price_id, plan, status,
   cancel_at_period_end, current_period_start, current_period_end,
   grace_until, latest_invoice_id, last_provider_event_created,
   created_at, updated_at)
SELECT id, organization_id, billing_customer_id, provider,
       provider_subscription_id, provider_price_id, plan, status,
       cancel_at_period_end, current_period_start, current_period_end,
       grace_until, latest_invoice_id, last_provider_event_created,
       created_at, updated_at
FROM {{SAAS_TABLE_PREFIX}}subscriptions_0049;

DROP TABLE {{SAAS_TABLE_PREFIX}}subscriptions_0049;
CREATE INDEX idx_subscriptions_customer
  ON {{SAAS_TABLE_PREFIX}}subscriptions(billing_customer_id);
CREATE INDEX idx_subscriptions_status
  ON {{SAAS_TABLE_PREFIX}}subscriptions(status);

