# Documentation Governance

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `documentation-governance` |
| Applies to | `v0.5+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | Informal document-status conventions |
| Superseded by | — |

This document defines the enforceable documentation policy for Runory. The navigation model lives in [Documentation Home](README.md); this document defines how documents are created, classified, reviewed, superseded, and validated.

## Scope

The policy applies to Markdown files under `docs/` and to repository-level Markdown files that are part of the public or contributor documentation surface.

The policy deliberately separates three concerns:

1. **Authority** — which document governs a bounded topic.
2. **Lifecycle** — whether a document is current, proposed, historical, or evidence.
3. **Discoverability** — whether a reader can reach the document from the governed documentation graph.

## Required metadata

Every new normative, operational, planning, or evidence document under `docs/` must place this table immediately after its title:

```markdown
| Metadata | Value |
| --- | --- |
| Status | `canonical` \| `active` \| `proposed` \| `historical` \| `evidence` |
| Topic | `product` \| `workspace` \| `fsm` \| `architecture` \| `customization` \| `identity` \| `catalog` \| `operations` \| `releases` \| `documentation-governance` |
| Applies to | Version or date range |
| Owner | Product \| Engineering \| Operations |
| Last reviewed | YYYY-MM-DD |
| Supersedes | Path, title, or `—` |
| Superseded by | Path, title, or `—` |
```

Existing documents are migrated when materially edited. A change that alters product behavior, architecture authority, operating procedure, or release interpretation is material.

## Lifecycle rules

### `canonical`

The authoritative source for a bounded topic.

- Prefer exactly one canonical document per topic boundary.
- A canonical document must be linked from `docs/README.md`.
- Replacing it requires explicit `Supersedes` and `Superseded by` updates in the same pull request.

### `active`

A current guide, runbook, implementation specification, or acceptance procedure.

- It may specialize a canonical document but must not contradict it.
- It must identify the canonical topic authority through a link or Related Documents section.

### `proposed`

A design, TODO, roadmap, or plan that has not become the current baseline.

- Adoption requires changing the status to `active` or incorporating the decision into a canonical document.
- Completion alone does not make a proposal canonical.

### `historical`

Context retained to explain prior decisions or implementation phases.

- It must not appear as the primary onboarding path.
- Readers must be able to identify the current replacement through the topic index or `Superseded by`.

### `evidence`

A point-in-time test report, acceptance run, drill result, migration record, or release validation artifact.

- Evidence records what happened; it does not define what should happen.
- Evidence must link to the specification, runbook, or release it validates.

## Topic authority

Topic authorities are declared in [Documentation Home](README.md). A new document must select one topic and identify the authority it supports, specializes, proposes changing, or validates.

Cross-topic documents should select the topic whose authority would resolve a conflict. Other relevant topics belong in Related Documents, not as multiple primary topics.

## Supersession protocol

When authority changes:

1. Add the replacement document or materially update the existing authority.
2. Set the old document to `historical`.
3. Fill `Supersedes` on the replacement and `Superseded by` on the old document.
4. Update `docs/README.md` in the same pull request.
5. Preserve old paths unless a separate migration is justified.

A filename containing a newer version does not automatically supersede an older file.

## Document placement

| Content | Preferred location |
| --- | --- |
| Product definition and specifications | `docs/product/` |
| Architecture decisions and reviews | `docs/architecture/` |
| Operating procedures | `docs/operations/` |
| Release, test, drill, and acceptance evidence | `docs/releases/` |
| Research and benchmarks | `docs/research/` |
| SDK-specific reference | `docs/sdk/` |
| User-facing cross-topic guides | `docs/` |

Versioned implementation plans may remain in their current locations. New documents should follow the preferred placement unless the topic authority documents a reason not to.

## Discoverability requirements

Every important Markdown document must be reachable through Markdown links starting from `docs/README.md`.

A document is compliant when it is linked from one of the following:

- `docs/README.md`;
- its topic authority;
- another reachable document in a clear Related Documents or evidence chain.

Directory mentions without a direct Markdown link do not count as indexing an individual document.

## Review cadence

- Canonical documents: review at each relevant release milestone and at least every six months.
- Active runbooks and guides: review after material operational or interface changes.
- Proposed documents: review when the associated milestone changes.
- Historical documents: no periodic review required.
- Evidence: immutable except for factual corrections and link repair.

`Last reviewed` means a human evaluated whether the content is still authoritative or operationally correct; formatting-only edits do not reset it.

## Automated enforcement

Run:

```bash
pnpm docs:check
```

The checker validates:

- relative Markdown links resolve;
- documents linked from the governance graph exist;
- metadata values use the approved vocabulary;
- no topic has multiple explicitly canonical documents;
- newly added or materially edited governed documents include metadata;
- evidence and historical files are not accidentally declared canonical.

GitHub Actions runs the same check for pull requests and pushes to `main`.

## Pull request requirements

Documentation pull requests must answer:

1. Which topic does this change belong to?
2. What is its lifecycle status?
3. Which canonical document governs it?
4. Does it supersede anything?
5. Is it normative content or evidence?
6. Has the topic index been updated when discoverability or authority changed?

The repository pull request template contains the corresponding checklist.
