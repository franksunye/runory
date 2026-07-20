# Add a Governed Command

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `catalog` |
| Applies to | `v0.6+` |
| Owner | Engineering |
| Last reviewed | 2026-07-20 |
| Supersedes | — |
| Superseded by | — |

Use a governed Command when a mutation changes a protected lifecycle,
commercial invariant, accepted evidence, or another authoritative business
fact. Ordinary descriptive fields and Workspace Metadata remain generic CRUD.

## Minimal path

1. Declare the aggregate's state and version fields in `domain.aggregates`.
2. Declare one stable Command key, legal transition, permission, expected
   version policy, events, audit requirement, and critical result assertions.
3. Keep the aggregate's own state update in its handler.
4. Add a semantic Provider requirement only when another authoritative owner
   must participate in the same transaction.
5. Implement the handler through `executeCommand`; return statements, events,
   audit evidence, aggregate result, and Provider effect inputs.
6. Generate structural and capability-closure test cases from the Manifest.
7. Add domain fixtures for legal/illegal transitions, stale versions,
   idempotency, rollback, and permission denial.

Start from the smallest existing catalog Module with a similar aggregate.
Copy only its Manifest shape, then replace the identity, aggregate, permission,
event, and transition. A public executable template is intentionally deferred
until an external Module author needs one.

## Generated Contract checks

Use `runory validate` for Manifest structure and Catalog validation for
aggregate references and Provider closure. Test the real handler with domain
fixtures for legal and illegal transitions, stale versions, idempotency,
rollback, and permission denial. A generated SDK test API is intentionally
deferred until it has a real external consumer.

## Aggregate statement or semantic Provider?

| Put the write in | Use when | Example |
| --- | --- | --- |
| Aggregate handler | The fact is owned by the Command's aggregate and shares its lifecycle/version | `quote.status`, `service_visit.actual_end` |
| Semantic Provider | Another authoritative owner must change atomically and can be addressed through a stable business capability | complete a Schedule reservation, release an Assignment |
| Outbox effect | The target is external and cannot share the local transaction | email, payment provider, telephony |
| Projection | The data is derived, rebuildable, and not independently editable | dashboard count, search index |

Do not create a Provider merely to move SQL into another file. A Provider is
justified by a real ownership boundary or reusable platform capability.

Every atomic Provider reports its semantic prepared-record count separately
from its SQL statement count. Each returned statement must declare
`expectedRowsAffected`; a mismatch rolls back the complete Command.

## Handler acceptance checklist

- The handler observes and audits the real source state.
- `audit.after.status` matches the declared target state.
- Critical returned fields use typed result assertions.
- The aggregate write uses expected version/state predicates.
- Required events are emitted once.
- Provider inputs contain semantic identifiers and validated data, not foreign
  SQL or table names.
- Workflow, Automation, UI, API, MCP, and Agents invoke the same named Command.
- No generic CRUD path can update the governed fields.

For the full model and versioning rules, see
[Contract-Driven Command Architecture](../architecture/contract-driven-command-architecture.md).
