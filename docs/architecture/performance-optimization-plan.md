# Performance Optimization Plan

> Status: In progress
> Last updated: 2026-06-29
> Owner: Engineering

## Background

Production (Vercel + Turso) feels significantly slower than local dev. Two reported symptoms:

1. First-time data loading is slow in production, fast in local dev.
2. On every refresh, the dashboard first shows an initialization/empty state, then switches to the data view.

Investigation confirmed both symptoms are caused by multiple compounding factors across the stack. This document captures the full picture and a phased plan.

## Already Shipped (v1)

These changes are on `main` and deployed:

| Commit | Area | Change |
|--------|------|--------|
| `a79bc35` | Dashboard | Cache module/pack manifests in-memory; cache `checkSoftDeleteColumns`; add `POST /widgets/batch` to eliminate widget N+1; parallelize `loadLayout` + `checkHasData`; only clear page-level `loading` after both resolve (fixes empty-state flash). |
| `f2286a8` | Records | Batch extension field value queries in `getRecords` — replaces N sequential `SELECT`s per row with a single `WHERE record_id IN (...)` query. Benefits every object list page. |
| `640a08e` | SWR | Disable `revalidateOnFocus` to stop refetching every hook on every tab switch. |

## Root Causes Still Open

### A. Region mismatch (likely the dominant factor)

- Turso DB is in `aws-ap-northeast-1` (Tokyo).
- Vercel project has no `regions` config in `vercel.json`, so functions default to `iad1` (Washington, US East).
- User base is in China.

Every DB query round-trips `Vercel (US East) -> Turso (Tokyo) -> Vercel (US East)`, adding ~150-250ms per query. A list page with 5+ queries accumulates 1s+ of pure network latency before any code runs.

**This explains why local dev (SQLite on localhost) is dramatically faster than production, even after the N+1 fix.**

### B. No HTTP response caching

- `successResponse` in `apps/cloud/src/lib/http.ts` sets no `Cache-Control`, `ETag`, or `Last-Modified`.
- All GET routes are `force-dynamic` and all client fetches use `cache: "no-store"`.
- Even near-static metadata (navigation, installations, fields, views) is re-fetched on every navigation.

### C. Per-request auth overhead with no memoization

- `requireWorkspaceContext` runs 2-3 DB queries per API route (resolveSession + authorizeWorkspace).
- A single list page triggers 4 API calls = 8-12 redundant auth queries for the same session/workspace.
- `resolveSession` also writes `last_used_at` on every read (1 UPDATE per API call).

### D. Serverless cold-start schema check

- `ensureSchema()` re-runs migration checks on every cold start.
- `globalThis.__platformDb` and `__platformSchemaReady` are reset on Vercel cold starts.
- Migrations should run at deploy time, not on every cold invocation.

### E. Other minor factors

- No server-side pagination (less critical at current data volumes).
- FK enrichment calls `getFields` per distinct lookup target (constant cost, low priority).
- Marketing/static pages are `force-dynamic` despite being static content.

---

## Phased Plan

### Phase 1 — Infrastructure & config (highest ROI, lowest code change)

**Goal:** Eliminate the network latency penalty and enable HTTP caching.

| # | Task | Type | Expected Impact |
|---|------|------|-----------------|
| 1.1 | Confirm Vercel plan; if Pro, set `regions: ["hnd1"]` in `vercel.json` to co-locate functions with Turso (Tokyo). | Config | **Very High** — cuts DB RTT from ~200ms to ~1ms per query. |
| 1.2 | Add `Cache-Control: private, max-age=30, stale-while-revalidate=300` to GET responses for near-static endpoints (navigation, installations, fields, views, dashboard layout). | Code | High — browser caches metadata for 30s; navigation between pages becomes instant. |
| 1.3 | Remove `cache: "no-store"` from client fetches for read-only endpoints (keep for mutations). | Code | Medium — works with 1.2 to enable browser HTTP cache. |
| 1.4 | Run migrations as a Vercel Build Step; gate `ensureSchema()` behind `process.env.SKIP_SCHEMA_ENSURE` in production. | Code/Config | Medium — removes migration check from every cold start. |

**Verification:** Measure TTFB and total list-page load time before/after.

### Phase 2 — Auth & request lifecycle (medium ROI, medium effort)

**Goal:** Stop paying redundant auth query cost per API call.

| # | Task | Type | Expected Impact |
|---|------|------|-----------------|
| 2.1 | Memoize `resolveSession` + `authorizeWorkspace` within a single request using `AsyncLocalStorage`. | Code | High — eliminates 6-10 redundant queries per page load. |
| 2.2 | Throttle `last_used_at` UPDATE to once per 5 minutes per session (store last update timestamp in a short-lived cookie or in-memory LRU). | Code | Medium — removes 1 write per API call. |
| 2.3 | Consider moving session token verification to JWT (stateless) so read-only APIs can run on Edge Runtime. | Architectural | High long-term; large effort. Defer to Phase 4. |

### Phase 3 — Data layer refinements (lower ROI, polish)

**Goal:** Squeeze out remaining constant-factor overheads.

| # | Task | Type | Expected Impact |
|---|------|------|-----------------|
| 3.1 | Add process-level cache for `getFields` with invalidation on install/extension/rollback. | Code | Medium — saves 2 queries per `getRecords` call. |
| 3.2 | Add server-side pagination to `ObjectListPage` (pass `limit`/`offset` to `useRecords`). | Code | Low now, high at scale. |
| 3.3 | Add `keepPreviousData` to SWR hooks for smoother page transitions. | Code | Low — UX polish. |
| 3.4 | Statically generate marketing/static pages (`/login`, `/pricing`, `/docs`, etc.). | Code | Low — reduces function invocations. |

### Phase 4 — Architectural (long-term, large effort)

**Goal:** Edge-first architecture for sub-100ms cold starts.

| # | Task | Type | Expected Impact |
|---|------|------|-----------------|
| 4.1 | Move auth to JWT so stateless read APIs can run on Edge Runtime. | Architectural | Very high long-term. |
| 4.2 | Consider read-replica / cached metadata layer (e.g., Upstash Redis) for hot metadata. | Architectural | High at scale. |
| 4.3 | Consider Turso multi-region replicas if user base expands beyond one region. | Infra | High at scale. |

---

## Priority Order for Execution

1. **Phase 1.1 (Vercel region)** — likely the single biggest win. Confirm plan first.
2. **Phase 1.2 + 1.3 (HTTP caching)** — quick code change, broad benefit.
3. **Phase 1.4 (migration at build time)** — removes cold-start tax.
4. **Phase 2.1 (auth memoization)** — eliminates redundant queries.
5. Everything else is polish or long-term.

## Open Questions

- What Vercel plan is the project on? (Hobby = single region; Pro = multi-region.)
- Is there a budget concern for Pro plan + Tokyo region?
- Are there compliance constraints on where session data is processed (affects JWT/Edge decision)?

## How to Track Progress

Update the "Already Shipped" table at the top of this doc as commits land. Each phase can be a separate PR or a batch of commits on `main`.
