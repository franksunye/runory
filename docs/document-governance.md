# Documentation Governance

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `documentation-governance` |
| Applies to | `v0.5+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | Informal document-status conventions |
| Superseded by | — |

This is the enforceable policy behind the canonical [Documentation Home](README.md). It defines how Runory documents are classified, reviewed, superseded, discovered, and validated.

## Required metadata

Every new or materially edited document under `docs/` must place this table immediately after its title:

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

A material edit changes product behavior, architecture authority, operating procedure, acceptance criteria, or release interpretation. Formatting-only edits do not reset `Last reviewed`.

## Lifecycle

| Status | Use |
| --- | --- |
| `canonical` | Authoritative source for a bounded topic. Prefer one authority per topic boundary. |
| `active` | Current guide, runbook, implementation specification, or acceptance procedure. |
| `proposed` | Design, TODO, roadmap, or plan not yet adopted as the current baseline. |
| `historical` | Retained context that no longer directs implementation or operations. |
| `evidence` | Point-in-time test, drill, migration, acceptance, or release record. |

Evidence records what happened and must link to the specification or runbook it validates. Historical material must not be presented as the primary onboarding path.

## Topic authority

Topic authorities are declared in [Documentation Home](README.md). Each new document selects one primary topic and identifies the authority it supports, specializes, proposes changing, or validates.

Cross-topic documents select the topic whose authority would resolve a conflict. Other relevant topics belong in Related Documents.

## Supersession

When authority changes:

1. Add or update the replacement authority.
2. Set the old document to `historical`.
3. Fill `Supersedes` on the replacement and `Superseded by` on the old document.
4. Update `docs/README.md` in the same pull request.
5. Preserve existing paths unless a separate migration PR is justified.

A newer version number does not automatically supersede an older file.

## Placement

| Content | Preferred location |
| --- | --- |
| Product definitions and specifications | `docs/product/` |
| Architecture decisions and reviews | `docs/architecture/` |
| Operating procedures | `docs/operations/` |
| Test, drill, acceptance, and release evidence | `docs/releases/` |
| Research and benchmarks | `docs/research/` |
| SDK reference | `docs/sdk/` |
| Cross-topic user guides | `docs/` |

Existing versioned plans may remain in place. New documents follow this placement unless the relevant authority records a reason not to.

## Discoverability

Every important document must be reachable through Markdown links starting from `docs/README.md`. A direct link may come from the index, a topic authority, or another reachable document in a clear Related Documents or evidence chain.

Directory mentions alone do not index individual documents.

## Review cadence

- Canonical documents: each relevant release milestone and at least every six months.
- Active guides and runbooks: after material operational or interface changes.
- Proposed documents: when the associated milestone changes.
- Historical documents: no periodic review required.
- Evidence: immutable except for factual correction and link repair.

## Automated enforcement

Run:

```bash
pnpm docs:check
```

The checker validates relative links, metadata vocabulary, canonical uniqueness, evidence classification, and governance metadata for new or materially edited documents. It also reports legacy documents that remain outside the reachable topic graph.

GitHub Actions runs the same check for documentation pull requests and pushes to `main`.

## Pull request requirements

Documentation changes must identify their topic, lifecycle status, canonical authority, supersession effect, and whether they are normative content or evidence. Authority and discoverability changes must update `docs/README.md` in the same pull request.
