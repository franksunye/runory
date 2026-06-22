-- Migration: 0003_email_otp_auth
-- Description: Phase 1 Email OTP authentication and server sessions
--   - auth_identities: links a normalized email to a User (one user can have multiple identities in future)
--   - auth_challenges: OTP challenges (hash-only, single-use, expiring)
--   - sessions: opaque session tokens (hash-only, rotating, expiring)
--   - audit auth events: login, OTP failure, logout, session revoke

-- ── Auth Identities ──
-- One row per (user_id, method) pair. method = 'email_otp' now, 'oidc'/'saml' later.
-- email_normalized is the canonical lookup key (lowercase, trimmed).
-- email_display preserves the user's original casing for UI.

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'email_otp' CHECK (method IN ('email_otp', 'oidc', 'saml')),
  email_normalized TEXT NOT NULL,
  email_display TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, method),
  UNIQUE(method, email_normalized),
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_auth_identities_email
  ON {{RUNORY_TABLE_PREFIX}}auth_identities(method, email_normalized);

-- ── Auth Challenges (OTP) ──
-- code_hash stores SHA-256 of the 6-digit OTP code. The plaintext code is NEVER stored.
-- single-use: consumed_at is set on successful verification.
-- expiring: expires_at is set at creation (5-10 minutes).
-- attempt limit: attempts counts verification tries, max_attempts enforced in service.

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}auth_challenges (
  id TEXT PRIMARY KEY,
  auth_identity_id TEXT,
  email_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'org_deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  ip_hash TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(auth_identity_id) REFERENCES {{RUNORY_TABLE_PREFIX}}auth_identities(id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_auth_challenges_email
  ON {{RUNORY_TABLE_PREFIX}}auth_challenges(email_normalized, status, created_at);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_auth_challenges_expires
  ON {{RUNORY_TABLE_PREFIX}}auth_challenges(expires_at, status);

-- ── Sessions ──
-- token_hash stores SHA-256 of the opaque session token. The plaintext token is NEVER stored.
-- Rotation: on each request, a new token can be issued and the old one invalidated.
-- Expiry: expires_at is checked on each request.
-- Revocation: revoked_at is set on logout/revoke.

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_sessions_user
  ON {{RUNORY_TABLE_PREFIX}}sessions(user_id, status);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_sessions_token
  ON {{RUNORY_TABLE_PREFIX}}sessions(token_hash, status);

-- ── Rate Limit Storage (simple in-db counter for OTP/IP/email rate limiting) ──
-- Keyed by (bucket_type, bucket_key, window_start). bucket_key is a hash of email or IP.
-- This is a simple sliding-window counter. For production, consider a dedicated rate limiter.

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}rate_limit_buckets (
  id TEXT PRIMARY KEY,
  bucket_type TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  UNIQUE(bucket_type, bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_rate_limit_lookup
  ON {{RUNORY_TABLE_PREFIX}}rate_limit_buckets(bucket_type, bucket_key, window_end);
