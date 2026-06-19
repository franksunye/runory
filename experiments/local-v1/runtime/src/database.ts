import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ActivityRecord, ExpenseRecord, NavigationItem } from "@runory/shared";
import type { BusinessEvent } from "./events.js";
import { getDatabasePath } from "./paths.js";

export interface DatabaseContext {
  db: DatabaseSync;
  expenses: ExpenseRepository;
  dashboard: DashboardRepository;
  navigation: NavigationRepository;
  events: EventRepository;
  audit: AuditRepository;
}

export function createDatabaseContext(path = getDatabasePath()): DatabaseContext {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);

  return {
    db,
    expenses: new ExpenseRepository(db),
    dashboard: new DashboardRepository(db),
    navigation: new NavigationRepository(db),
    events: new EventRepository(db),
    audit: new AuditRepository(db)
  };
}

function runMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS navigation_items (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      label TEXT NOT NULL,
      route TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      enabled INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const insertNav = db.prepare(`
    INSERT INTO navigation_items (id, module_id, label, route, icon, sort_order, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      route = excluded.route,
      icon = excluded.icon,
      sort_order = excluded.sort_order,
      enabled = excluded.enabled
  `);

  insertNav.run("dashboard", "expense-core", "总览", "/dashboard", "layout-dashboard", 10, 1);
  insertNav.run("expense-intake", "expense-core", "费用", "/expense/intake", "receipt", 20, 1);
}

export class ExpenseRepository {
  constructor(private readonly db: DatabaseSync) {}

  findOrCreateVendor(name: string) {
    const normalized = name.trim().toLowerCase();
    const existing = this.db
      .prepare("SELECT id, name FROM vendors WHERE normalized_name = ?")
      .get(normalized) as { id: string; name: string } | undefined;
    if (existing) return existing;

    const now = new Date().toISOString();
    const id = `ven_${randomUUID()}`;
    this.db
      .prepare("INSERT INTO vendors (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, name.trim(), normalized, now, now);
    return { id, name: name.trim() };
  }

  create(input: {
    vendorId: string;
    expenseDate: string;
    amount: number;
    currency: string;
    category: string;
    description: string;
    status: string;
    confidence: number;
    source: string;
  }) {
    const id = `exp_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO expenses
         (id, vendor_id, expense_date, amount, currency, category, description, status, confidence, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.vendorId,
        input.expenseDate,
        input.amount,
        input.currency,
        input.category,
        input.description,
        input.status,
        input.confidence,
        input.source,
        now,
        now
      );
    return this.getById(id);
  }

  list(limit = 50): ExpenseRecord[] {
    return (this.db
      .prepare(
        `SELECT e.id, v.name AS vendorName, e.expense_date AS expenseDate, e.amount, e.currency,
                e.category, e.description, e.status, e.confidence, e.source,
                e.created_at AS createdAt, e.updated_at AS updatedAt
         FROM expenses e
         JOIN vendors v ON v.id = e.vendor_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.created_at DESC
         LIMIT ?`
      )
      .all(limit) as unknown) as ExpenseRecord[];
  }

  getById(id: string): ExpenseRecord {
    const row = this.db
      .prepare(
        `SELECT e.id, v.name AS vendorName, e.expense_date AS expenseDate, e.amount, e.currency,
                e.category, e.description, e.status, e.confidence, e.source,
                e.created_at AS createdAt, e.updated_at AS updatedAt
         FROM expenses e
         JOIN vendors v ON v.id = e.vendor_id
         WHERE e.id = ?`
      )
      .get(id) as ExpenseRecord | undefined;

    if (!row) throw new Error(`Expense not found: ${id}`);
    return row;
  }
}

export class DashboardRepository {
  constructor(private readonly db: DatabaseSync) {}

  getSummary() {
    const totals = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'committed' THEN amount ELSE 0 END), 0) AS monthExpenseTotal,
          COUNT(CASE WHEN status = 'committed' THEN 1 END) AS monthExpenseCount,
          COUNT(CASE WHEN status = 'needs_review' THEN 1 END) AS reviewCount
         FROM expenses
         WHERE deleted_at IS NULL
           AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')`
      )
      .get() as { monthExpenseTotal: number; monthExpenseCount: number; reviewCount: number };

    const trend = this.db
      .prepare(
        `SELECT expense_date AS date, ROUND(SUM(amount), 2) AS amount
         FROM expenses
         WHERE deleted_at IS NULL
           AND status = 'committed'
         GROUP BY expense_date
         ORDER BY expense_date ASC
         LIMIT 30`
      )
      .all() as Array<{ date: string; amount: number }>;

    const recentActivity = this.db
      .prepare(
        `SELECT id, event_type AS eventType, payload_json AS payloadJson, created_at AS createdAt
         FROM business_events
         ORDER BY created_at DESC
         LIMIT 6`
      )
      .all()
      .map((row) => {
        const event = row as { id: string; eventType: string; payloadJson: string; createdAt: string };
        const payload = JSON.parse(event.payloadJson) as { title?: string; detail?: string };
        return {
          id: event.id,
          eventType: event.eventType,
          title: payload.title ?? event.eventType,
          detail: payload.detail ?? "",
          createdAt: event.createdAt
        } satisfies ActivityRecord;
      });

    return { ...totals, trend, recentActivity };
  }
}

export class NavigationRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): NavigationItem[] {
    return this.db
      .prepare(
        `SELECT id, label, route, icon, sort_order AS sortOrder, enabled
         FROM navigation_items
         WHERE enabled = 1
         ORDER BY sort_order ASC`
      )
      .all()
      .map((item) => ({ ...(item as Omit<NavigationItem, "enabled">), enabled: true }));
  }
}

export class EventRepository {
  constructor(private readonly db: DatabaseSync) {}

  record(event: BusinessEvent) {
    this.db
      .prepare(
        `INSERT INTO business_events (id, event_type, entity_type, entity_id, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.eventId,
        event.type,
        event.entityType,
        event.entityId,
        JSON.stringify(event.payload ?? {}),
        event.timestamp
      );
  }
}

export class AuditRepository {
  constructor(private readonly db: DatabaseSync) {}

  record(input: {
    source: string;
    action: string;
    entityType: string;
    entityId: string;
    after: unknown;
  }) {
    this.db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_type, source, action, entity_type, entity_id, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `aud_${randomUUID()}`,
        "agent",
        input.source,
        input.action,
        input.entityType,
        input.entityId,
        null,
        JSON.stringify(input.after),
        new Date().toISOString()
      );
  }
}
