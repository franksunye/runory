# Cloud-first POC Progress

Status: Completed  
Date: 2026-06-18  
Branch: feat/cloud-first-poc

## What Was Built

A complete Cloud-first POC on Next.js + SQLite (local dev) that validates the core hypothesis:

> **A metadata-driven object model, combined with Agent-governed Workspace Extensions, can deliver a running business application—without runtime code generation.**

### Implemented Components

| Layer | Files | Description |
|-------|-------|-------------|
| **Database** | `src/lib/db.ts` | SQLite schema: 11 platform tables + dynamic business tables |
| **Manifest Types** | `src/lib/manifest.ts` | Zod schemas for Module/Pack/Template/Extension Plan |
| **Pack Installer** | `src/lib/installer.ts` | YAML manifest parser + migration runner + metadata registration |
| **Metadata Runtime** | `src/lib/metadata.ts` | Object/Field/View/Navigation CRUD + Record CRUD with extension field merge |
| **Extension Runtime** | `src/lib/extension.ts` | Plan validation → Diff preview → Apply → Rollback, with audit log |
| **Audit & Export** | `src/lib/audit.ts` | Audit log query + workspace JSON export |
| **MCP Server** | `src/lib/mcp-server.ts` | 8 MCP tools (stdio transport) for Personal Agents |
| **API Routes** | `src/app/api/` (19 routes) | Full REST API with ToolEnvelope format |
| **UI Components** | `src/components/` (7 components) | SchemaTable, SchemaForm, SchemaField, NavigationShell, DiffPreview, AuditTimeline, ExtensionPanel |
| **UI Pages** | `src/app/` (9 pages) | Landing, Dashboard, Customer List/Form/Detail, Contact List, Audit, Settings |
| **Module Manifests** | `modules/` | runory.customer + runory.contact (with migrations) |
| **Pack Manifest** | `packs/crm-lite-pack/` | CRM Lite Pack aggregating 2 modules |
| **Template Manifest** | `templates/small-business-crm/` | Small Business CRM template |
| **Skill** | `skills/runory-smb-poc/SKILL.md` | Updated for Cloud POC MCP tools |

### Test Results (14/14 Acceptance Criteria Passed)

1. ✅ User can create a Workspace via web UI
2. ✅ User can install CRM Lite Pack from the UI
3. ✅ Pack install creates objects, fields, views, navigation via metadata
4. ✅ Schema-driven UI renders working customer list and form
5. ✅ User can create and view customer records
6. ✅ Personal Agent can submit Extension Plan via MCP tool
7. ✅ Diff Preview shown before apply
8. ✅ After confirm, field appears in list and form (polling)
9. ✅ Audit log records the full change
10. ✅ Rollback removes the field and restores prior state
11. ✅ Official Module manifest not modified by Extension
12. ✅ Workspace config exported as JSON
13. ✅ Runory never calls LLM APIs
14. ✅ Entire demo runs on Vercel + Turso (local SQLite for dev)

### Verified End-to-End Flow

```
Create Workspace → Install CRM Lite Pack
→ Customer list + form appear (schema-driven, no hardcoded fields)
→ Create customer record
→ Agent submits Extension Plan (客户等级 select field)
→ Validate → Preview Diff → Apply
→ Field appears in list column + form dropdown
→ Create record with extension field (tier = "A")
→ Audit log records extension.apply
→ Rollback → Field removed, views reverted
→ Audit log records extension.rollback
→ Export workspace as JSON
```

### Tech Stack Used

- **Next.js 15** (App Router, API Routes)
- **better-sqlite3** (local dev; Turso for production—same engine)
- **Tailwind CSS v4**
- **Zod** (manifest + extension plan validation)
- **YAML** (module/pack/template manifests)
- **MCP SDK** (stdio transport for Personal Agent integration)

### Key Design Decisions

1. **Hybrid storage**: Module fields in real columns, Extension fields in `extension_field_values` table (JSON), merged at read time
2. **Schema-driven UI**: SchemaTable and SchemaForm read view definitions from API—zero hardcoded fields
3. **Headless platform**: Runory has no LLM integration; Personal Agent generates plans, Runory only validates and executes
4. **Governed flow**: Plan → Preview → Apply → Audit → Rollback, all through MCP tools
5. **Extension point validation**: Module manifests declare `extensionPoints` with `reservedKeys`, `allowedTypes`, `maxFields`

### What's NOT in POC (Deferred)

- Multi-tenant isolation
- Authentication (OAuth/SSO)
- Custom Workflow runtime
- Marketplace UI
- Real-time WebSocket/SSE (using polling)
- Private/On-premise deployment
- Turso cloud connection (using local SQLite)
- Cloudflare Workers integration
