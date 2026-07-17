-- Subscription billing for Runory SaaS Organizations.
-- Transaction: required

CREATE TABLE IF NOT EXISTS {{SAAS_TABLE_PREFIX}}billing_customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS {{SAAS_TABLE_PREFIX}}subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  billing_customer_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT NOT NULL UNIQUE,
  provider_price_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('starter','pro','enterprise')),
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

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON {{SAAS_TABLE_PREFIX}}subscriptions(billing_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON {{SAAS_TABLE_PREFIX}}subscriptions(status);

CREATE TABLE IF NOT EXISTS {{SAAS_TABLE_PREFIX}}billing_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_created INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_status TEXT NOT NULL CHECK(processed_status IN ('processed','ignored','failed')),
  error_code TEXT,
  processed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_created
  ON {{SAAS_TABLE_PREFIX}}billing_webhook_events(event_created);
