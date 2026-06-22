-- Migration: 0004_phase2_org_invitations
-- Description: Phase 2 Organization invitations and workspace grants
--   - organization_invitations: one-time, expiring, hashed-token invitations
--   - invitation_workspace_grants: workspaces and roles granted upon acceptance
--
-- Boundary rules (docs/07-saas-core-boundaries.md §7):
--   - Invitations expire in 7 days
--   - Token is hash-only, single-use
--   - Only Organization owner/admin can invite
--   - Acceptance requires OTP verification with the same email
--   - Acceptance creates OrganizationMembership + WorkspaceMembership in one transaction

-- ── Organization Invitations ──

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  email_display TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  organization_role TEXT NOT NULL DEFAULT 'member' CHECK (organization_role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES {{RUNORY_TABLE_PREFIX}}organizations(id),
  FOREIGN KEY(invited_by) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id),
  FOREIGN KEY(accepted_by) REFERENCES {{RUNORY_TABLE_PREFIX}}users(id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_org_invitations_org
  ON {{RUNORY_TABLE_PREFIX}}organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_org_invitations_email
  ON {{RUNORY_TABLE_PREFIX}}organization_invitations(email_normalized, status);
CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_org_invitations_token
  ON {{RUNORY_TABLE_PREFIX}}organization_invitations(token_hash, status);

-- ── Invitation Workspace Grants ──
-- Each invitation can grant access to multiple workspaces with different roles.
-- When the invitation is accepted, a WorkspaceMembership is created for each grant.

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}invitation_workspace_grants (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_role TEXT NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('admin', 'member', 'viewer')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES {{RUNORY_TABLE_PREFIX}}organization_invitations(id),
  FOREIGN KEY(workspace_id) REFERENCES {{RUNORY_TABLE_PREFIX}}workspaces(id),
  UNIQUE(invitation_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}idx_invitation_grants_invitation
  ON {{RUNORY_TABLE_PREFIX}}invitation_workspace_grants(invitation_id);
