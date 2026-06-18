import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DB = Database.Database;

const DB_PATH = process.env.RUNORY_DB_PATH ?? resolve(process.cwd(), "data/runory.db");

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  return _db;
}

function runMigrations(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      template_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      module_version TEXT NOT NULL,
      pack_id TEXT,
      status TEXT NOT NULL DEFAULT 'installed',
      installed_at TEXT NOT NULL,
      UNIQUE(workspace_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS object_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      label TEXT NOT NULL,
      module_id TEXT,
      ownership TEXT NOT NULL DEFAULT 'module_owned',
      created_at TEXT NOT NULL,
      UNIQUE(workspace_id, object_key)
    );

    CREATE TABLE IF NOT EXISTS field_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      ownership TEXT NOT NULL DEFAULT 'module_owned',
      required INTEGER NOT NULL DEFAULT 0,
      default_value TEXT,
      validation_json TEXT,
      module_id TEXT,
      extension_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(workspace_id, object_key, field_key)
    );

    CREATE TABLE IF NOT EXISTS view_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      view_key TEXT NOT NULL,
      view_type TEXT NOT NULL,
      label TEXT NOT NULL,
      config_json TEXT NOT NULL,
      module_id TEXT,
      extension_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(workspace_id, object_key, view_key)
    );

    CREATE TABLE IF NOT EXISTS navigation_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      label TEXT NOT NULL,
      route TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'file',
      sort_order INTEGER NOT NULL DEFAULT 100,
      module_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS extension_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      namespace TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extension_versions (
      id TEXT PRIMARY KEY,
      extension_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      manifest_json TEXT NOT NULL,
      diff_json TEXT,
      risk_level TEXT NOT NULL DEFAULT 'low',
      change_summary TEXT,
      created_by TEXT NOT NULL,
      approved_by TEXT,
      applied_at TEXT,
      rollback_of_version INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(extension_id, version)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      extension_version_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      status TEXT NOT NULL,
      extension_version_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extension_field_values (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      record_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      extension_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, object_key, record_id, field_key)
    );
  `);
}

// Helper to generate IDs
export function genId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

// Helper to get current timestamp
export function now(): string {
  return new Date().toISOString();
}
