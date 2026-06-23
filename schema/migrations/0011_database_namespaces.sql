-- Migration: 0011_database_namespaces
-- Description: Split the former platform_* namespace into reusable SaaS Core,
-- Runory Runtime, and Runory Catalog namespaces. The migration ledger is moved
-- to sys_schema_migrations by the migration runner before this migration runs.
-- Transaction: required

-- ── Generic SaaS Core ──

ALTER TABLE {{PLATFORM_TABLE_PREFIX}}users RENAME TO {{SAAS_TABLE_PREFIX}}users;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}auth_identities RENAME TO {{SAAS_TABLE_PREFIX}}auth_identities;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}auth_challenges RENAME TO {{SAAS_TABLE_PREFIX}}auth_challenges;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}sessions RENAME TO {{SAAS_TABLE_PREFIX}}sessions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}rate_limit_buckets RENAME TO {{SAAS_TABLE_PREFIX}}rate_limit_buckets;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}organizations RENAME TO {{SAAS_TABLE_PREFIX}}organizations;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}organization_memberships RENAME TO {{SAAS_TABLE_PREFIX}}organization_memberships;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}organization_invitations RENAME TO {{SAAS_TABLE_PREFIX}}organization_invitations;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}workspaces RENAME TO {{SAAS_TABLE_PREFIX}}workspaces;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}workspace_tenants RENAME TO {{SAAS_TABLE_PREFIX}}workspace_tenants;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}workspace_memberships RENAME TO {{SAAS_TABLE_PREFIX}}workspace_memberships;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}invitation_workspace_grants RENAME TO {{SAAS_TABLE_PREFIX}}invitation_workspace_grants;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}api_keys RENAME TO {{SAAS_TABLE_PREFIX}}api_keys;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}audit_logs RENAME TO {{SAAS_TABLE_PREFIX}}audit_logs;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}organization_entitlements RENAME TO {{SAAS_TABLE_PREFIX}}organization_entitlements;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}usage_events RENAME TO {{SAAS_TABLE_PREFIX}}usage_events;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}usage_rollups RENAME TO {{SAAS_TABLE_PREFIX}}usage_rollups;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}export_jobs RENAME TO {{SAAS_TABLE_PREFIX}}export_jobs;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}deletion_jobs RENAME TO {{SAAS_TABLE_PREFIX}}deletion_jobs;

-- ── Runory Platform Runtime ──

ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}installations;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}object_definitions RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}object_definitions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}field_definitions RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}field_definitions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}view_definitions RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}view_definitions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}navigation_items RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}navigation_items;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}extension_definitions RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}extension_definitions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}extension_versions RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}extension_versions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}extension_field_values RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}extension_field_values;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}agent_runs RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}agent_runs;

-- ── Runory Catalog & Release Control Plane ──

ALTER TABLE {{PLATFORM_TABLE_PREFIX}}catalog_items RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}items;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}catalog_versions RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}versions;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}catalog_validation_runs RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}validation_runs;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}catalog_releases RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}releases;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}pack_version_locks RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}pack_version_locks;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}release_rollouts RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}release_rollouts;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}rollout_targets RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}rollout_targets;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}compatibility_reports RENAME TO {{RUNORY_CATALOG_TABLE_PREFIX}}compatibility_reports;

-- v0.2.2: Contact table repair removed. Migration 0008 now creates the contact
-- table with the correct schema (primary_company_id instead of customer_id).
-- The legacy repair (rename + copy + drop) is no longer needed for new installs.
