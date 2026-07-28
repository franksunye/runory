# Twenty UI Code-Level Study for Batch 2

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `architecture` |
| Applies to | `v0.8.x` Batch 2 — UI surface maturity |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-28 |
| Source baseline | Twenty commit `6060d88` at `/Users/yesun/Code/runory-reference-platforms/twenty` |
| Governing guardrails | [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md) |
| Binding decision | [Runory UI Surface Technical Decision and Standards](../architecture/v0.8-ui-surface-technical-decision.md) |
| Supersedes | — |
| Superseded by | [Runory UI Surface Technical Decision and Standards](../architecture/v0.8-ui-surface-technical-decision.md) as implementation authority |

## 1. Purpose

This document records a code-level understanding of Twenty's UI implementation
to inform Runory's Batch 2 (UI surface maturity). It is not a feature-parity
exercise. Each section maps a Twenty pattern to a concrete Runory adaptation
candidate, classified as Adopt, Adapt, or Reject.

This document is research evidence, not an implementation specification. The
[Runory UI Surface Technical Decision and Standards](../architecture/v0.8-ui-surface-technical-decision.md)
evaluates these candidates against the implemented Runory contracts and is the
binding authority. In particular, it rejects a generic SWR state hook, runtime
field-renderer registration, shadcn adoption, broad Server Component migration,
and mandatory container queries for this batch; it also defers partial-data UI
until an API owns typed partial-success semantics.

## 2. Twenty architecture summary

Twenty separates UI into two layers:

- **`twenty-ui`** — an atomic component library (buttons, cards, feedback,
  typography, theme tokens). No page-level components live here.
- **`twenty-front`** — the application layer that composes `twenty-ui`
  primitives into record tables, detail pages, view bars, and command menus.

Styling uses SCSS Modules with a global token injection pattern. State
management uses Jotai atom families. The record table uses a "treadmill"
virtualization scheme (240 fixed DOM rows recycled on scroll).

Runory's current stack: Next.js + Tailwind CSS + CSS custom properties in
`globals.css` + SWR for data fetching. No separate UI package; all components
live in `apps/cloud/src/components/`.

## 3. Design system layer

### 3.1 Token system

**Twenty**: CSS custom properties prefixed `--t-*`, grouped by semantic
category (font, border, background, accent, color, spacing). Light/dark themes
toggle via `.light` / `.dark` class on `documentElement`. Structural tokens
(spacing, font-size, border-radius) are identical across themes; only color
tokens change. Colors use `color(display-p3 ...)` wide-gamut format sourced
from `@radix-ui/colors`.

**Runory current**: CSS custom properties in `globals.css` (`--brand`,
`--ink`, `--muted`, `--line`, `--surface`, `--canvas`, etc.). No dark theme.
Structural scales exist (`--space-*`, `--text-*`, `--radius-*`, `--shadow-*`).

**Decision: Adapt**. Retain Runory's existing token names and Tailwind-first
approach. Add missing semantic tokens for states:
- `--state-loading-bg`, `--state-empty-fg`, `--state-error-fg`,
  `--state-error-border`, `--state-error-bg`
- These reuse existing palette values but provide stable hooks for shared
  state components.
- Do not adopt `color(display-p3)` or Radix color scales; Runory's hex/sRGB
  palette is sufficient for v0.8.

### 3.2 Button system

**Twenty**: `Button` component with a variant × accent × position matrix
(`primary/secondary/tertiary` × `default/blue/danger/green` ×
`standalone/left/middle/right`). SCSS uses "bridge variables" (`--btn-bg`,
`--btn-color`, etc.) set by `[data-variant][data-accent]` attribute selectors.
This keeps CSS specificity at `(0,1,0)` so `styled()` overrides still work.

**Runory current**: Component classes `.app-button-primary`,
`.app-button-secondary`, `.app-button-ghost`, `.app-button-danger` in
`globals.css`. No position/grouping support. Tone is encoded in class name,
not in a data attribute.

**Decision: Adapt**. Runory's View contract already defines `tone:
"primary" | "secondary" | "danger"` on `ViewAction`. Map this directly to
existing button classes via a `toneToClass()` utility (already exists as
`actionToneClass()` in `lib/view-actions.ts`). Do not introduce Twenty's
bridge-variable SCSS pattern; Runory's Tailwind `@apply` component classes
achieve the same override capability with simpler tooling. Add a
`ButtonGroup` wrapper for adjacent action buttons.

### 3.3 Card / Surface components

**Twenty**: `Card > [CardHeader] > CardContent > [CardFooter]` with
divider control via `data-*` attributes. `Modal` uses Base UI's dialog
primitive with size/padding/overlay enums.

**Runory current**: `.app-card` component class (rounded-2xl, border,
shadow). No formal CardHeader/CardContent/CardFooter split. Modals use
ad-hoc divs with `z-[60]`.

**Decision: Adopt (partial)**. Formalize the three-part card composition
as React components (`<Card>`, `<CardHeader>`, `<CardContent>`,
`<CardFooter>`) wrapping the existing `.app-card` class. This gives
schema-driven surfaces a consistent shell without changing the visual
design. Do not adopt Twenty's Modal system; Runory's `z-[60]` constraint
and existing modal patterns are sufficient.

### 3.4 Typography

**Twenty**: `H1Title`, `H2Title`, `H3Title`, `Label`, `StyledText` — each
maps to a specific font-size/weight token combination. `H2Title` and
`H3Title` support optional description and adornment.

**Runory current**: Inline Tailwind classes (`text-3xl font-bold`,
`text-sm text-slate-500`). No shared typography components.

**Decision: Adopt (lightweight)**. Add `PageHeader` and `SectionHeader`
components that encode Runory's existing title/subtitle/eyebrow pattern
(already used in `ObjectListPage`). These are thin wrappers, not a full
typography system.

## 4. State components (loading, empty, error, partial-data)

### 4.1 Twenty's approach

Twenty does **not** have a unified `<EmptyState>` or `<ErrorState>`
component. Instead:

- **Empty**: `AnimatedPlaceholder` (illustration) +
  `EmptyPlaceholderStyled` (4 sub-components: Container, TextContainer,
  Title, SubTitle). The consumer assembles these.
- **Error**: `ErrorPlaceholderStyled` (4 sub-components, same structure,
  no fade-in animation). `Callout` component for inline error/warning/info.
- **Loading**: `Loader` (three-dot animation), `CircularProgressBar`,
  `ProgressBar`. No Skeleton component in `twenty-ui`.
- **Table loading**: `RecordTableBodyLoading` renders 80 skeleton rows
  using plain colored divs (not react-loading-skeleton).
- **Table empty**: 5 variants dispatched by `RecordTableEmptyState`:
  read-only, remote, soft-delete, no-records-at-all, filtered-to-empty.
  Each has different copy and CTA.
- **Table error**: No catch in the data-loading effect; errors propagate
  to a global handler. This is a known gap.

### 4.2 Runory current

- **Loading**: `.app-skeleton` class with shimmer animation. Used in
  `ObjectListPage` (6 skeleton rows). Not used in `SchemaTable` or
  `ObjectDetailPage`.
- **Empty**: Inline in `SchemaTable` (Inbox icon + text) and
  `ObjectListPage` (two variants: searching vs. no-records). No shared
  component.
- **Error**: No error state UI. API errors surface via `apiFetch` which
  throws; callers either show nothing or a generic message.
- **Partial data**: Not handled.

### 4.3 Decision: Adopt with Runory-specific design

Create four shared state components in a new `components/states/` directory:

```
components/states/
  EmptyState.tsx       — icon + title + description + optional action
  LoadingState.tsx     — skeleton variant for table/form/page
  ErrorState.tsx       — icon + title + description + retry action
  PartialDataState.tsx — inline banner for partial-load scenarios
```

**EmptyState** (Adapt Twenty's composition, simplify to single component):

```tsx
interface EmptyStateProps {
  icon?: LucideIcon;        // default: Inbox
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

Render: centered flex column, `icon` at 28px in `text-slate-300`, title in
`text-sm font-semibold text-slate-800`, description in
`text-sm text-slate-500`, action as `app-button-primary` or
`app-button-secondary`.

**LoadingState** (Adopt Twenty's table skeleton pattern):

```tsx
interface LoadingStateProps {
  variant: "table" | "form" | "page" | "detail";
  rows?: number;  // for table variant, default 6
}
```

- `table`: render N skeleton rows matching column structure
- `form`: render skeleton sections with field-shaped blocks
- `page`: render skeleton header + table (current `ObjectListPage` pattern)
- `detail`: render skeleton summary card + field grid

**ErrorState** (Fill Twenty's gap):

```tsx
interface ErrorStateProps {
  title?: string;           // default: "Something went wrong"
  description?: string;
  retryAction?: { label: string; onClick: () => void };
}
```

This is where Runory improves on Twenty — every schema-driven surface must
catch and display errors locally rather than relying on a global handler.

**PartialDataState** (New, not in Twenty):

For scenarios where some records loaded but others failed. An inline
`InlineBanner`-style component: yellow/warning tone, message, optional
retry.

### 4.4 Table empty-state variants (Adopt Twenty's 5-variant dispatch)

Runory's `ObjectListPage` currently has 2 empty variants (searching vs.
no-records). Adopt Twenty's approach of dispatching by context:

| Condition | Title | CTA |
| --- | --- | --- |
| No permission to create | "No records found" | none |
| Searching, no results | "No results found" | "Clear search" |
| No records at all | "No {title} yet" | "Add {title}" (if canCreate) |
| Filtered to empty | "No {title} match the current filter" | "Clear filter" |
| View config missing | "View not configured" | none |

Wire these through the `emptyState` field in `ListViewConfigV1` when
present; fall back to defaults otherwise.

## 5. Field rendering

### 5.1 Twenty's dispatcher

`FieldDisplay.tsx` uses a chain of type-guard functions
(`isFieldText`, `isFieldNumber`, `isFieldBoolean`, etc.) in a ternary
expression to dispatch to ~25 type-specific display components. Each guard
is a simple `field.type === FieldMetadataType.XXX` predicate that also
narrows the TypeScript type.

`FieldInput.tsx` mirrors this for editable fields.

### 5.2 Runory current

`SchemaField.tsx` uses a `switch (field.type)` statement for input
rendering. `SchemaTable.tsx` uses hardcoded `fieldKey === "status"` and
`fieldKey === "priority"` checks for badges — this is not metadata-driven
and breaks for any object with different status values.

### 5.3 Decision: Adapt — metadata-driven field renderer

Create a `FieldDisplay` component and a `FieldRenderer` registry that maps
Runory's field types to display components:

```tsx
// components/fields/FieldDisplay.tsx
function FieldDisplay({ field, value, displayValue, locale }: FieldDisplayProps) {
  const renderer = FIELD_DISPLAY_REGISTRY[field.type] ?? DefaultFieldDisplay;
  return renderer({ field, value, displayValue, locale });
}
```

Registry entries:

| Field type | Display component | Pattern |
| --- | --- | --- |
| `text` | `TextDisplay` | plain text, `—` for empty |
| `number` | `NumberDisplay` | locale-formatted number |
| `boolean` | `BooleanDisplay` | Yes/No text |
| `date` | `DateDisplay` | locale date, relative time for created_at/updated_at |
| `select` | `SelectDisplay` | badge with color from field metadata |
| `lookup` | `LookupDisplay` | link to referenced record |
| `user` | `UserDisplay` | avatar + name |
| `currency` | `CurrencyDisplay` | locale currency format |
| `email` | `EmailDisplay` | clickable mailto link |
| `phone` | `PhoneDisplay` | clickable tel link |

**Key principle**: Badge colors must come from field metadata
(`field.validation.options` with `{ value, label, color }`), not from
hardcoded `STATUS_BADGE_CLASS` maps. This is the single most important
change for field rendering consistency.

### 5.4 Inline editing (Reject for v0.8)

Twenty's `RecordInlineCell` dual-mode (display/edit with Portal) is a
sophisticated interaction pattern. Runory's form-based editing is sufficient
for v0.8. Inline editing is deferred.

## 6. Record table (list view)

### 6.1 Twenty's table architecture

```
RecordTable
  → state router (loading / empty / content)
    → RecordTableContent
      → RecordTableHeader (sticky, draggable columns)
      → RecordTableBody (virtualized 240-row treadmill)
      → RecordTableAggregateFooter (optional)
```

- Virtualization: 240 fixed DOM rows, recycled on scroll. Offset-based
  page loading (10 records per page). Fast-scroll degradation to skeleton.
- Column widths: CSS variables `--record-table-column-field-N`, set
  inline from field metadata.
- Column header dropdown: Filter / Sort / Move / Hide per column.
- Row selection: checkbox column, shift-range select.
- Row actions: right-click command menu, hover edit button (portal).

### 6.2 Runory current

Simple HTML `<table>` with `overflow-x-auto`. "Load more" button
pagination. No column resize, no column hide/show, no row selection, no
inline actions. Sorting and filtering are in the page header, not per-
column.

### 6.3 Decision: Adapt incrementally

**Keep**: Simple HTML table, "load more" pagination. Do not adopt
Twenty's treadmill virtualization — Runory's datasets are small enough
that it is over-engineering.

**Add in Batch 2**:
1. **Skeleton loading rows** in `SchemaTable` when `loading=true` (6 rows
   matching column structure, using `.app-skeleton`).
2. **Consistent empty state** via `<EmptyState>` component (section 4.3).
3. **Error state** via `<ErrorState>` component.
4. **Column width** from `ListViewConfigV1.columns[].width` mapped to
   CSS (`sm: w-24`, `md: w-40`, `lg: w-60`).
5. **Action column** rendered from `viewConfig.actions` (filtered by
   permission), not a hardcoded "View" link.
6. **Responsive**: On mobile (`< 640px`), collapse table to card list.
   Each record becomes a stacked card with field label + value pairs.

**Reject for v0.8**: Column drag-and-drop, column hide/show UI, row
selection/checkboxes, right-click command menu, aggregate footer. These
are powerful but exceed Batch 2's scope.

### 6.4 View bar and saved preferences

**Twenty**: `ViewBar` with saved view picker, filter chips, sort chips,
and URL query param synchronization. View preferences are persisted
server-side.

**Runory current**: Search input + sort dropdown in `ObjectListPage`.
No saved views, no filter chips, no URL sync for filters. View
preferences API exists (Spec §4.6) but is not wired to the UI.

**Decision: Adapt (wire existing contract)**. Batch 1 added the
`view_preferences` table and API. Batch 2 wires it into the UI:
- Add a "Save view" button that persists current sort/search/columns.
- Restore saved preferences on page load.
- This is a thin UI layer over the existing API, not a new ViewBar
  component.

## 7. Record detail page

### 7.1 Twenty's approach

Configuration-driven `PageLayout` with `Widget` dispatch. The detail page
is a container that loads a `pageLayoutId` and renders widgets (FIELDS,
TIMELINE, TASKS, NOTES, FILES, EMAILS, RECORD_TABLE, etc.) in tabs.
Each widget is wrapped in `WidgetCardShell` with permission and error
boundaries.

### 7.2 Runory current

`ObjectDetailPage` is a hardcoded structure:
- Summary card (avatar + title + metadata)
- Editable form (via `SchemaForm` when in edit mode)
- Read-only field display (when in view mode)
- Parent link panels
- Related records panels (via `SchemaTable` embedded)
- Workflow panel
- Timeline section

### 7.3 Decision: Adapt (formalize existing structure, not widget system)

Do not adopt Twenty's Widget/PageLayout system — it is too complex for
v0.8 and Runory's detail pages have stable, known structure.

**Add in Batch 2**:
1. **Loading skeleton** for the detail page (summary card skeleton +
   field grid skeleton).
2. **Not-found state** when record doesn't exist (currently throws).
3. **Error state** when record fetch fails.
4. **Consistent field display** using the new `FieldDisplay` component
   (section 5.3) for read-only mode, replacing ad-hoc rendering.
5. **Summary card** as a shared component (`<RecordSummaryCard>`) with
   avatar, title, and metadata fields — reusable across all detail pages.
6. **Section headers** using `<SectionHeader>` component.

**Reject for v0.8**: Widget system, tabbed layouts, drag-and-drop widget
reordering, side panel mode.

## 8. Responsive / mobile

### 8.1 Twenty's approach

No separate mobile components. Desktop-first with conditional rendering:
`useIsMobile()` hook + CSS media queries. Table disables column resize,
hides hover buttons, and adjusts column widths on mobile.

### 8.2 Runory current

Tailwind responsive classes (`sm:`, `md:`) used throughout. Table uses
`overflow-x-auto`. No card-list fallback for mobile.

### 8.3 Decision: Adopt card-list fallback

For table views on mobile (`< 640px`), render records as stacked cards
instead of a horizontal-scroll table. Each card shows the record's
display field as title and 2-3 key fields below. This is the single most
impactful mobile improvement.

For detail pages, the existing `sm:grid-cols-2` → `grid-cols-1` pattern
is sufficient. Ensure summary card adapts (horizontal on mobile, vertical
on desktop).

## 9. Permission-filtered action rendering

### 9.1 Current state

Runory already has `filterActionsByPermission()` and `actionToneClass()`
in `lib/view-actions.ts`. `ObjectListPage` uses `hasCreateAction` to
show/hide the create button. `SchemaForm` renders `commandActions` with
correct tone classes.

### 9.2 Decision: Adopt (already partially done)

Ensure all action rendering goes through the shared utilities:
- List page header actions from `viewConfig.actions` (not hardcoded).
- Detail page actions from `viewConfig.actions` (not hardcoded icon
  buttons).
- Table row actions from `viewConfig.actions` (not hardcoded "View" link).
- Form actions from `viewConfig.actions` + `commandActions` (already
  done).

## 10. Summary of Batch 2 deliverables

| Deliverable | Classification | Source pattern |
| --- | --- | --- |
| `EmptyState` component | Adapt | Twenty's EmptyPlaceholderStyled |
| `LoadingState` component (4 variants) | Adapt | Twenty's RecordTableBodyLoading |
| `ErrorState` component | New (fills Twenty gap) | — |
| `PartialDataState` component | New | — |
| `FieldDisplay` + registry | Adapt | Twenty's FieldDisplay dispatcher |
| Metadata-driven badge colors | Adapt | Twenty's SelectFieldDisplay |
| `Card` / `CardHeader` / `CardContent` / `CardFooter` | Adopt | Twenty's Card system |
| `PageHeader` / `SectionHeader` | Adopt | Twenty's H2Title pattern |
| `ButtonGroup` wrapper | Adapt | Twenty's ButtonGroup |
| Table skeleton rows | Adapt | Twenty's RecordTableBodyLoading |
| Table empty-state variants (5) | Adapt | Twenty's RecordTableEmptyState |
| Table action column from viewConfig | Adapt | Twenty's per-action rendering |
| Mobile card-list fallback | New | — |
| Detail page loading skeleton | Adapt | Twenty's ShowPageSummaryCard skeleton |
| Detail page not-found / error states | New | — |
| `RecordSummaryCard` shared component | Adapt | Twenty's ShowPageSummaryCard |
| View preferences wired to UI | Adapt | Twenty's ViewBar (simplified) |
| State tokens in globals.css | Adapt | Twenty's token system |
| Inline editing | Reject | Twenty's RecordInlineCell |
| Virtualization | Reject | Twenty's treadmill |
| Widget/PageLayout system | Reject | Twenty's PageLayout |
| Column drag/resize/hide | Reject | Twenty's column interactions |
| Row selection / command menu | Reject | Twenty's row interactions |
| Dark theme | Reject | Twenty's theme system |
| SCSS Modules + bridge variables | Reject | Twenty's styling architecture |

## 11. File structure plan

```
apps/cloud/src/components/
  states/
    EmptyState.tsx
    LoadingState.tsx
    ErrorState.tsx
    PartialDataState.tsx
    index.ts
  fields/
    FieldDisplay.tsx
    displays/
      TextDisplay.tsx
      NumberDisplay.tsx
      BooleanDisplay.tsx
      DateDisplay.tsx
      SelectDisplay.tsx
      LookupDisplay.tsx
      UserDisplay.tsx
      CurrencyDisplay.tsx
      EmailDisplay.tsx
      PhoneDisplay.tsx
    registry.ts
    index.ts
  layout/
    Card.tsx           (Card, CardHeader, CardContent, CardFooter)
    PageHeader.tsx
    SectionHeader.tsx
    ButtonGroup.tsx
    RecordSummaryCard.tsx
    index.ts
  SchemaTable.tsx      (refactored to use states + FieldDisplay)
  SchemaForm.tsx       (refactored to use Card + SectionHeader)
  ObjectListPage.tsx   (refactored to use states + view preferences)
  ObjectDetailPage.tsx (refactored to use states + RecordSummaryCard)
```

## 12. Candidate alternatives evaluated — not copying Twenty

> The alternatives in sections 12–15 are retained as proposal history. They
> must not be implemented directly; use the linked binding UI decision.

Twenty is a general-purpose configurable platform: users create custom
objects, views, and workflows at runtime. Runory already has a dynamic object
route shell and supports declarative Workspace-owned small custom objects; it
also intends to make object creation more flexible. The material difference is
not "dynamic versus fixed": Runory composes governed, versioned metadata and a
closed set of admitted UI/business primitives, while Twenty also carries a
broader Widget/PageLayout application runtime. The sections below analyze ways
to preserve Runory's dynamic-object direction without prematurely adopting that
entire runtime.

### 12.1 Why not copy Twenty's architecture

| Dimension | Twenty | Runory |
| --- | --- | --- |
| Object model | User-defined at runtime | Installed and Workspace-owned objects through governed declarative metadata; broader dynamic creation planned |
| View system | Generic views plus Widget/PageLayout engine | Typed dynamic list/form views plus stable composite product pages |
| State management | Jotai atom families (complex) | SWR (simple) |
| Styling | SCSS Modules + bridge variables | Tailwind CSS |
| Rendering | Pure Client Components | Next.js (can use Server Components) |
| Data scale | Potentially millions of records | Hundreds to low thousands per object |

Twenty invests heavily in generic configurable systems because it must.
Runory's advantage is a governed primitive vocabulary: new objects can be
dynamic without making their UI or authoritative behavior arbitrary.

### 12.2 State standardization — discriminated union + hook

**Twenty's approach**: manually assemble `AnimatedPlaceholder` +
`EmptyPlaceholderStyled` sub-component family. No unified entry point.
Consumer must remember to compose all pieces.

**Smarter alternative**: a discriminated union `SurfaceState` plus a
`useSurfaceState` hook that wraps SWR and auto-maps to the correct state.
TypeScript's exhaustiveness checking forces all branches to be handled.
Impossible states become impossible to express.

```ts
type SurfaceState =
  | { status: "loading"; variant: "table" | "form" | "page" | "detail" }
  | { status: "empty"; variant: EmptyVariant; action?: ActionConfig }
  | { status: "error"; error: Error; retry: () => void }
  | { status: "ready"; data: unknown[] };

function useSurfaceState<T>(
  swrResult: SWRResponse<T[]>,
  options?: { emptyVariant?: EmptyVariant; emptyAction?: ActionConfig }
): SurfaceState { ... }
```

A single `<SurfaceStateRenderer state={state} />` component dispatches to
`LoadingState`, `EmptyState`, `ErrorState`, or children. Every data-driven
surface gets correct states with zero boilerplate. Twenty's approach
requires the consumer to manually assemble sub-components, making
omissions easy.

### 12.3 Field rendering — Map registry with extension slots

**Twenty's approach**: `FieldDisplay.tsx` uses a ~25-element type-guard
ternary chain. O(n) lookup, hard to maintain, silently returns empty
fragment on miss.

**Smarter alternative**: a `Map<FieldType, FieldRenderer>` registry with
O(1) lookup. TypeScript exhaustiveness on the `FieldType` union forces
registration of every type. But Runory also needs extensibility —
Workspace Extensions and future modules may introduce new field types.

**Extensibility design**:

```ts
// Core registry (covers the 9 built-in FieldType values)
const FIELD_DISPLAY_REGISTRY = new Map<FieldType, FieldRenderer>();

// Extension slot: modules and workspace extensions can register
// custom renderers without modifying core code
export function registerFieldDisplay(
  type: string,
  renderer: FieldRenderer
): void {
  FIELD_DISPLAY_REGISTRY.set(type, renderer);
}

// Lookup with graceful fallback
function resolveRenderer(type: string): FieldRenderer {
  return FIELD_DISPLAY_REGISTRY.get(type) ?? DefaultFieldDisplay;
}
```

The registry is a `Map`, not a switch statement or ternary chain, so:
- Adding a new field type (e.g., `currency`, `rating`, `rich_text`) is
  one `registerFieldDisplay()` call, not a modification to a long chain.
- Module manifests can declare custom field types and ship corresponding
  renderer registrations in their frontend entry point.
- The fallback `DefaultFieldDisplay` ensures unknown types render
  gracefully instead of silently disappearing.

**Convention-based auto-registration** (optional enhancement): if a
module ships a `displays/{type}.tsx` file, it is auto-registered. This
eliminates the manual `registerFieldDisplay()` call. This is deferred
until a module actually needs a custom field type — the explicit
registration is sufficient for v0.8.

### 12.4 Table implementation — keep it simple

**Twenty's approach**: self-built treadmill virtualization (240 fixed DOM
rows recycled on scroll), self-built column rendering, self-built row
selection. ~5000 lines of virtualization code.

**Smarter alternative**: keep Runory's current HTML `<table>` + "load
more" pagination. Runory's datasets are hundreds to low thousands of
records — virtualization is over-engineering. Add only:
- Skeleton rows (6 rows matching column structure)
- Shared `EmptyState` / `ErrorState` components
- Column width from `ListViewConfigV1.columns[].width`
- Action column from `viewConfig.actions` (permission-filtered)
- Mobile card-list fallback via container queries

**If virtualization is ever needed**: adopt TanStack Table (headless) +
TanStack Virtual, not a custom treadmill. TanStack Table provides sorting,
filtering, pagination, column visibility, and row selection as tested,
composable hooks. The rendering layer stays Tailwind. This is a future
decision, not a Batch 2 deliverable.

### 12.5 Layout primitives — own the code, not a dependency

**Twenty's approach**: self-built Card/Modal/Typography component family
with SCSS Modules and bridge variables.

**Smarter alternative**: adopt the shadcn/ui pattern — copy
battle-tested, accessible component source code into the project via CLI.
The components use Tailwind (Runory's existing stack), include ARIA
attributes out of the box, and live in the repository with no runtime
dependency.

```bash
# Optional: use shadcn CLI to scaffold initial component source
npx shadcn@latest add card skeleton
# Then customize to match Runory's design tokens
```

The result: accessible Card, Skeleton, and Dialog components that Runory
fully owns and can adapt. No SCSS Modules, no bridge variables, no
runtime dependency. This is lighter than Twenty's self-built component
family and more accessible than Runory's current ad-hoc divs.

For Runory's specific needs, the Card family can also be thin wrappers
around the existing `.app-card` class, combining the visual consistency
of the current design with the structural clarity of Header/Content/Footer
composition.

### 12.6 View state — URL as single source of truth

**Twenty's approach**: `ViewBar` with Jotai state + URL query param
synchronization (bidirectional sync between two state sources).

**Smarter alternative**: URL search params as the single source of truth
for transient view state (search query, sort, filters). Next.js
`searchParams` prop in Server Components reads this directly. Client-side
navigation uses `router.push()` to update the URL.

```ts
// Server Component reads searchParams directly
function ObjectListPage({ searchParams }: { searchParams: ViewSearchParams }) {
  const sortBy = searchParams.sort ?? "created_at:desc";
  const search = searchParams.q ?? "";
  // ...
}
```

The `view_preferences` table (Spec §4.6) stores only persistent
preferences (visible columns, page size, default sort). Transient state
(search, active filters) lives in the URL. This eliminates the need for
a state management library and makes views shareable, bookmarkable, and
back-button-friendly by default.

### 12.7 Mobile responsive — container queries, not JS hooks

**Twenty's approach**: `useIsMobile()` JavaScript hook + conditional
rendering inside each component.

**Smarter alternative**: CSS container queries. Components adapt based on
their own container width, not the viewport. A table embedded in a
sidebar and a table on a full page can both render correctly without
JavaScript.

```css
.record-table-container { container-type: inline-size; }

@container (max-width: 640px) {
  .record-table { display: none; }
  .record-card-list { display: flex; flex-direction: column; gap: 0.5rem; }
}
```

Tailwind CSS v4 supports `@container` prefixes natively. This is simpler
and more robust than Twenty's JS-based approach.

### 12.8 Server Components for read-only rendering

**Twenty's approach**: all Client Components. Field display, table
rendering, and detail pages all run client-side.

**Smarter alternative (Next.js advantage)**: Runory uses Next.js, which
supports Server Components. Read-only field display and detail page
rendering can run on the server, reducing client-side JavaScript. Only
interactive elements (forms, search, sort controls) need to be Client
Components.

This is a strategic advantage Twenty's architecture cannot match. It
reduces bundle size, improves initial load, and simplifies the client
state model. Batch 2 should prefer Server Components for state
components (`LoadingState`, `EmptyState`) and field display, using
`"use client"` only where interactivity is required.

### 12.9 Extensibility without a Widget engine

Twenty's product supports a broader Widget/PageLayout application runtime.
Runory also needs runtime-created objects and views, but can support them by
composing admitted declarative primitives:

1. **Workspace Extensions** add custom fields to existing objects —
   handled by the `FieldDisplay` registry (section 12.3). Extension
   fields render through the same registry as core fields.

2. **View modifications** (add/hide/reorder columns, add sections) —
   handled by the existing `view_definitions` config and Workspace
   Extension plan/apply system. The UI reads the effective config; it
   does not need to know whether a column came from a module or an
   extension.

3. **Future field primitives** — a genuinely new `FieldType` is introduced
   through a versioned platform contract, compatibility review, renderer, and
   tests. Dynamic objects built from existing field types require no frontend
   registration.

4. **Custom actions** — modules declare Commands and ViewActions in
   manifests. The UI renders them through the existing
   `filterActionsByPermission()` + `actionToneClass()` pipeline.

This achieves extensibility without the complexity of Twenty's Widget
engine, PageLayout config system, or Block/Flow UI runtime. The key
insight: Runory's extensions compose through **typed contracts**
(FieldType registry, ViewAction array, View config schema), not through
a generic UI runtime.

## 13. Candidate Batch 2 deliverables (non-binding)

| Deliverable | Approach | Why not Twenty's |
| --- | --- | --- |
| `SurfaceState` type + `useSurfaceState` hook | Discriminated union + SWR wrapper | Twenty has no unified state entry; consumer assembles sub-components |
| `SurfaceStateRenderer` component | Single dispatch component | Twenty requires manual composition |
| `LoadingState` (4 variants) | Tailwind skeleton, not react-loading-skeleton | Twenty uses plain colored divs; Runory already has `.app-skeleton` |
| `EmptyState` | Single component with icon/title/description/action | Twenty splits into 4 sub-components |
| `ErrorState` | Single component with retry — fills Twenty's gap | Twenty has no table-level error state |
| `FieldDisplay` + extensible Map registry | `Map<FieldType, FieldRenderer>` + `registerFieldDisplay()` | Twenty uses O(n) ternary chain |
| Metadata-driven badge colors | Read from `field.validation.options` | Twenty's pattern is right; Runory currently hardcodes |
| `Card` / `CardHeader` / `CardContent` / `CardFooter` | Thin wrappers on `.app-card` or shadcn-sourced | Twenty uses SCSS Modules + bridge variables |
| `PageHeader` / `SectionHeader` | Lightweight TypeScript components | Twenty has full typography system (over-scope) |
| `ButtonGroup` | Flex wrapper with gap | Twenty has position-aware button system (over-scope) |
| Table skeleton rows | 6 rows matching column structure | Twenty uses 80 rows + treadmill (over-engineering) |
| Table empty-state variants | 5 context-aware variants via `EmptyVariant` enum | Same concept, simpler implementation |
| Table action column | From `viewConfig.actions` filtered by permission | Twenty uses right-click command menu (over-scope) |
| Mobile card-list fallback | CSS container queries | Twenty uses JS `useIsMobile()` hook |
| Detail page loading skeleton | Summary card + field grid skeleton | Same concept |
| Detail page not-found / error states | New, fills gap | Twenty has no table-level error |
| `RecordSummaryCard` | Shared component, Server Component friendly | Twenty's is Client-only |
| View preferences wired to UI | URL params for transient, `view_preferences` for persistent | Twenty uses Jotai + URL dual sync |
| State tokens in `globals.css` | Add `--state-*` semantic tokens | Twenty has full `--t-*` token system (over-scope) |
| Server Components for read-only surfaces | Next.js RSC for field display and states | Twenty is pure Client Components |

## 14. Candidate extensibility contract (non-binding)

The UI layer must support these extension paths without core code changes:

| Extension path | Mechanism | Example |
| --- | --- | --- |
| New field type | Versioned platform contract plus renderer and compatibility tests | A future `currency` primitive is added deliberately; new objects reuse it declaratively |
| Custom field on existing object | Workspace Extension adds field; existing registry renders it | Extension adds `priority` select field to Work Order |
| View column modification | Workspace Extension plan modifies `view_definitions` config | Extension hides a column, reorders others |
| New action on existing view | Module manifest declares new ViewAction; UI renders via `view-actions.ts` | Quote module adds `quote.submit` command action |
| New object with standard views | Module manifest declares views; UI renders via existing `ObjectListPage` / `ObjectDetailPage` | New `return_request` module gets list + detail pages |
| Custom empty-state copy | `ListViewConfigV1.emptyState` field overrides defaults | Invoice list shows "No invoices yet — create your first invoice" |

This contract is the extensibility boundary. Anything beyond it (custom
page layouts, widget reordering, inline editing, canvas builder) is
explicitly deferred and would require a future architecture decision.

## 15. Candidate validation criteria (non-binding)

1. No schema-driven surface contains bespoke loading/empty/error markup —
   all use shared `SurfaceStateRenderer` or individual state components.
2. No field rendering uses hardcoded `fieldKey === "status"` checks — all
   badges derive color from field metadata.
3. All list views render consistently on mobile (container-query card-list
   fallback, no JS `useIsMobile()` hook).
4. All detail pages show loading skeleton, not-found, and error states.
5. View preferences (visible columns, page size, default sort) persist and
   restore; transient state (search, active filters) lives in URL params.
6. Action rendering on all surfaces goes through `view-actions.ts`
   utilities.
7. `FieldDisplay` registry is extensible via `registerFieldDisplay()` —
   adding a field type does not require modifying core rendering code.
8. Read-only surfaces prefer Server Components; only interactive elements
   use `"use client"`.
9. Existing 1420 tests continue to pass.
10. New tests cover each state component, field display variant, and the
    registry extension mechanism.
