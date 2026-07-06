# Cloud-first POC Progress

Status: Completed  
Date: 2026-06-18  
Branch: feat/cloud-first-poc

> Historical status note (2026-06-22): This document records the 2026-06-18 POC acceptance point and is not the current source of truth for SaaS Core status. The initial Organization/User/Membership model, Workspace API authorization, and production-grade UI foundation have already started. The remaining formal scope and phase status are defined by [07-saas-core-boundaries.md](07-saas-core-boundaries.md) and [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md).

## What Was Built

A complete Cloud-first POC on Next.js + SQLite (local dev) that validates the core hypothesis:

> **A metadata-driven object model, combined with Agent-governed Workspace Extensions, can deliver a running business application—without runtime code generation.**

### Implemented Components

| Layer | Files | Description |
|-------|-------|-------------|
| **Platform Core** | `packages/platform-core/` | Turso/libSQL persistence, metadata, installer, extensions, audit and export |
| **Contracts** | `packages/contracts/` | Zod schemas for Module/Pack/Template/Extension Plan |
| **MCP Server** | `apps/mcp/` | 8 MCP tools (stdio transport) for Personal Agents |
| **API Routes** | `src/app/api/` (19 routes) | Full REST API with ToolEnvelope format |
| **UI Components** | `src/components/` (7 components) | SchemaTable, SchemaForm, SchemaField, NavigationShell, DiffPreview, AuditTimeline, ExtensionPanel |
| **UI Pages** | `src/app/` (9 pages) | Landing, Dashboard, Customer List/Form/Detail, Contact List, Audit, Settings |
| **Official Catalog** | `catalog/` | Modules, CRM Lite Pack, and Small Business CRM template |
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
→ Agent submits Extension Plan (Customer Tier select field)
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
- **@libsql/client** (local SQLite file; Turso in Cloud)
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

### What's NOT in the 2026-06-18 POC Baseline

- Multi-tenant isolation
- Authentication (OAuth/SSO)
- Custom Workflow runtime
- Marketplace UI
- Real-time WebSocket/SSE (using polling)
- Private/On-premise deployment
- Production Turso credentials and deployed acceptance verification
- Cloudflare Workers integration
