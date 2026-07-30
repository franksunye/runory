# Test Case 06 — PWA Notifications

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P1 |
| Primary role | System user (workspace membership) + External user (customer-access) |
| Surface | Mobile PWA (Chrome Android / Safari iOS, real device or emulator strongly preferred) |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md) |
| Spec | v0.9 PWA Notification Technical Spec |

## 1. Purpose

Verify that Runory's PWA Web Push notification capability works end to end through
the real browser and OS — from PWA installation and explicit user-gated permission,
through VAPID subscription and server dispatch, to OS-level notification display,
click handling, and subscription lifecycle management.

This run answers:

> Can an installed Runory PWA receive privacy-safe push notifications for the P0
> business events, on more than one device, and can the user subscribe, tune
> preferences, test, and unsubscribe without ever calling an API directly?

## 2. Scope

### 2.1 What this run proves

- The PWA manifest and Service Worker register and install on Chrome (Android)
  and Safari (iOS).
- Notification permission is requested only after an explicit user gesture, never
  on page load.
- VAPID public key is fetched and used to create a `PushManager` subscription that
  is reported to the server.
- Notification preferences (7 categories) can be toggled and persist across
  reloads.
- A local test notification displays through the Service Worker without a server
  round trip.
- A remote test notification traverses the full dispatch chain
  (Notification → Message → MessageDelivery → Outbox → Web Push Provider →
  Service Worker → OS notification).
- Notification click closes the notification and focuses or opens a safe
  same-origin route without bypassing authentication.
- P0 business events for system users and external users produce notifications
  only for enabled categories.
- A second device can subscribe independently and both devices receive
  notifications.
- Unsubscribe removes the device both locally and on the server.
- Notification titles and bodies contain no customer name, phone, address,
  payment amount, invoice details, or free-form internal content.
- Provider 404/410 responses mark the subscription expired and stop retries.

### 2.2 What this run does not prove

- Desktop push reliability on every browser engine (focus is mobile PWA).
- Badge set/clear on platforms that do not support it.
- Workspace-level richer-preview policy (not part of v0.9).
- Email or SMS delivery channels (covered by test case 09).
- Operator diagnostics dashboards (covered by test case 09).

## 3. Delivery chain reference

```text
Business event (governed command succeeds)
  → triggerPushForCommand (push-hooks)
  → dispatchPushNotification
      → preference check (isCategoryEnabled)
      → getActiveSubscriptionsForPrincipal
      → Notification record
      → Message record (channel=web, author_type=system)
      → per subscription: MessageDelivery (channel=web, provider=web-push)
      → per subscription: Outbox message (type=message_delivery.web_push)
  → deliverWebPushMessage (outbox processor)
      → claimOutboxMessage
      → load active subscription
      → sendPushNotification (Web Push Provider, VAPID-signed)
      → on 2xx: markOutboxDelivered + markPushSubscriptionAccepted
      → on 404/410: expirePushSubscription (no retry)
      → on 400/401/403: markOutboxFailed (permanent, no retry)
      → on other: markOutboxFailed (transient, retried)
  → Service Worker `push` event
      → registration.showNotification(title, { body, icon, badge, tag, data.route })
  → OS notification
  → user click → `notificationclick` event
      → close notification
      → focus existing same-origin client on the route, or openWindow(targetPath)
```

PWA surface contract:

```text
Manifest          /manifest.json   id=/runory  start_url=/app  scope=/
Mobile manifest   /m/manifest.json id=/m       start_url=/m    scope=/m/
Service Worker    /sw.js           scope=/

/app launch resolver
  workspace session only       → /m (or last safe mobile workspace route)
  customer-access session only → /{locale}/access
```

Push API contract:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/push/config` | VAPID configuration status and public key (public) |
| GET | `/api/push/status` | Active subscriptions (safe view) and preferences for the principal |
| POST | `/api/push/subscribe` | Subscribe current device (`endpoint`, `p256dh`, `auth`) |
| DELETE | `/api/push/unsubscribe` | Disable (soft-delete) a subscription by `subscriptionId` |
| PATCH | `/api/push/preferences` | Update preference categories (partial) |
| POST | `/api/push/test-local` | Return a client-display test payload (no provider round trip) |
| POST | `/api/push/test-remote` | Dispatch a real push through the full chain to the principal |

Principal derivation is always server-side: a `customer_access_grant` (from the
customer-access cookie) or a `workspace_membership` (from the workspace session
plus `w` query parameter). No endpoint accepts a caller-supplied recipient.

Notification categories: `visits`, `workItems`, `messages`, `mentions`,
`reminders`, `announcements`, `reports`.

## 4. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] VAPID key pair generated and configured server-side (public key returned by
      `/api/push/config` with `configured: true`)
- [ ] Migration 0049 applied (`push_subscriptions` and `push_preferences` tables
      exist)
- [ ] Demo workspace created with FSM Pack and Sales Quote Pack installed
- [ ] A real Android device or Android emulator with Chrome, OR a real iOS device
      or iOS Simulator with Safari (desktop Chrome is an acceptable fallback only
      for Stages 0–6 and 10–11)
- [ ] Test device on the same network as the dev server, or tunnel reachable
- [ ] At least one workspace membership user (system-user principal) available
- [ ] At least one customer-access grant available for external-user events
      (created via test case 04 or fresh)
- [ ] OS notification permissions for the browser/PWA are not already denied
      (reset to "Ask" if previously denied)

## 5. Test data

```text
Run ID: PUSH-<YYYYMMDD>-<HHMM>

System user (workspace membership):
  Login:           <system-user email> (Field Technician or Owner)
  Workspace slug:  <workspace-slug>
  Workspace ID:    <workspace-id>

External user (customer-access):
  Access URL:      /<locale>/access#token=<grant-token>
  Grant ID:        <customer-access-grant-id>
  Root record:     <quote or work-order id>

Device A:          <e.g. Pixel 7 / Chrome 124>
Device B:          <e.g. iPhone 14 / Safari 17>  (used for multi-device stage)

Preference category under test (disabled):  workItems
Preference category kept enabled:           visits
```

## 6. Execution procedure

### Stage 0 — Verify environment and VAPID configuration

1. Open `http://localhost:3000/manifest.json` and confirm `id` is `/runory`,
   `start_url` is `/app`, and `scope` is `/`.
2. Open `http://localhost:3000/sw.js` and confirm it registers `push` and
   `notificationclick` listeners.
3. In a browser dev-tools console, call:
   ```js
   await fetch("/api/push/config").then(r => r.json())
   ```
4. Open `/m/account` and confirm the Notifications settings section loads.

**Expected:**

- Manifest matches the `/runory`, `/app`, `/` contract.
- `/sw.js` contains both `self.addEventListener("push", ...)` and
  `self.addEventListener("notificationclick", ...)`.
- `/api/push/config` returns `{ configured: true, publicKey: "<non-empty>" }`.
- The Notifications card shows the "VAPID configured" indicator (not the
  not-configured warning).

**Fail when:** VAPID is not configured; the public key is empty; the Service
Worker lacks a `push` or `notificationclick` handler; the manifest scope is not
`/`.

### Stage 1 — Install the PWA

1. On the test device, open `http://localhost:3000/app` in Chrome (Android) or
   Safari (iOS).
2. Use the browser/OS install action (`Add to Home screen` / `Install app`).
3. Launch the installed Runory PWA from the home screen.
4. Confirm it opens in standalone display mode (no browser chrome).

**Expected:**

- The install prompt is offered (Chrome) or `Add to Home Screen` succeeds
  (Safari iOS).
- The launched PWA runs in `display: standalone` (verified by
  `window.matchMedia("(display-mode: standalone)").matches === true`, or
  `navigator.standalone === true` on iOS).
- The `/m/account` notifications hint about installing as a PWA no longer appears
  once standalone.

**Fail when:** The manifest is not installable; the installed app opens in a
browser tab; the start URL or scope is wrong so the SW does not control the
launch.

### Stage 2 — Permission requested only after a user gesture

1. Launch the installed PWA and navigate to `/m/account`.
2. Before touching any control, check `Notification.permission` in dev tools.
3. Wait 30 seconds without interacting with the enable control.
4. Confirm no OS permission prompt appeared.

**Expected:**

- `Notification.permission` is `default` (not pre-granted).
- No permission prompt is shown on load or on idle.
- The "Enable" button is the only path to request permission.

**Fail when:** Permission is requested on page load, on focus, or on idle
without a tap (P1 finding — browser may block future prompts).

### Stage 3 — Subscribe to push

1. On `/m/account`, tap the **Enable** push button.
2. Approve the OS/browser notification permission prompt.
3. Allow the subscribe flow to complete.

**Expected:**

- The permission prompt appears immediately after the tap.
- After grant, the client fetches `/api/push/config`, calls
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, and
  POSTs `{ endpoint, p256dh, auth }` to `/api/push/subscribe`.
- The Notifications card switches to "Push enabled".
- The Active devices list shows one subscription (endpoint shown as a truncated
  label, no raw keys).
- `GET /api/push/status` returns one subscription in safe view (no `endpoint`
  or key material exposed beyond the truncated label).
- The subscription row in `push_subscriptions` has `status = 'active'` and the
  derived `principal_type`/`principal_id` (never caller-supplied).

**Fail when:** The subscribe step silently fails; the server stores a
caller-supplied principal; the safe view leaks the full endpoint, `p256dh`, or
`auth`; the Active devices list is empty after a successful subscribe.

### Stage 4 — Configure notification preferences

1. On `/m/account`, scroll to the preferences card.
2. Confirm all seven categories are listed: visits, workItems, messages,
   mentions, reminders, announcements, reports.
3. Toggle `workItems` OFF.
4. Reload the page.

**Expected:**

- All seven categories render with toggles defaulting to enabled.
- Toggling `workItems` fires `PATCH /api/push/preferences` with
  `{ category, enabled }` and persists optimistically.
- After reload, `workItems` remains OFF and the other six remain ON.
- `GET /api/push/status` returns preferences matching the toggled state.

**Fail when:** A category is missing; the toggle does not persist; the PATCH
reverts to defaults; preferences are editable while push is disabled (they
should be disabled when push is off).

### Stage 5 — Local test push (client-side display)

1. With push enabled, trigger the local test action (the client calls
   `POST /api/push/test-local` and displays the returned payload via
   `registration.showNotification`).

**Expected:**

- `/api/push/test-local` returns `{ title, body, route }`.
- The Service Worker displays an OS notification with the returned title and
  body.
- No provider round trip occurs (this is a client-side capability diagnostic).
- The notification appears even if the app is backgrounded.

**Fail when:** No notification appears; the client attempts to send through the
provider for a local test; the Service Worker is not active.

### Stage 6 — Remote test push (server → provider → device)

1. On `/m/account`, tap **Send test** (the client calls
   `POST /api/push/test-remote`).
2. Background the PWA (or lock the screen) and wait up to 60 seconds.

**Expected:**

- `/api/push/test-remote` returns `{ dispatched: true, notificationId: "..." }`.
- A real push traverses the full chain: `dispatchPushNotification` creates
  Notification + Message + MessageDelivery + Outbox, the outbox processor calls
  the Web Push Provider, and the Service Worker `push` handler displays the
  notification.
- The OS notification arrives on the device with title `Runory push test` and a
  neutral body.
- The subscription's `last_accepted_at` is updated; the MessageDelivery moves to
  `accepted`.

**Fail when:** `dispatched` is `false` despite an active subscription; the
outbox message is stuck in `pending`; the provider returns an error; no
notification arrives on the device within a reasonable window.

### Stage 7 — Notification click handling

1. Tap the test notification from Stage 6.
2. Observe the focused/opened target.

**Expected:**

- The notification closes immediately on click.
- The Service Worker focuses an existing same-origin client already on the
  payload route, or focuses any same-origin client, or opens a new window to the
  relative route.
- The opened route is a safe relative path (`/m`, `/access`, or `/app`-resolved
  route). Absolute or protocol-relative URLs (`https://evil.com`, `//evil.com`)
  are rejected and fall back to `/`.
- Opening the route never bypasses session, workspace, grant, or object
  authorization — an unauthenticated launch lands on login/access.

**Fail when:** The notification does not close; a cross-origin URL is opened;
the route bypasses authentication; no client is focused or opened.

### Stage 8 — Trigger P0 business events

Run each event through the real product UI (not direct API calls). Verify
delivery for the principal that subscribed in Stage 3.

**System-user events (workspace membership principal):**

| Event | Trigger | Expected category | Expected title |
| --- | --- | --- | --- |
| Work assigned | Assign a work item/visit to the subscribed user | workItems (but disabled in Stage 4) | Work assigned |
| Work reassigned | Reassign the work to the subscribed user | workItems (disabled) | Work reassigned |
| Visit rescheduled | Reschedule the assigned visit | visits (enabled) | Schedule updated |
| Visit cancelled | Cancel the assigned visit's schedule | visits (enabled) | Visit cancelled |
| Work returned | Return submitted work for correction | workItems (disabled) | Work returned |
| Approval/review actionable | Claim a work item ready for the user | approval/reminders | Approval needed |

**External-user events (customer-access principal):**

| Event | Trigger | Expected category | Expected title |
| --- | --- | --- | --- |
| Quote ready | `quote.mark_sent` on a quote with an active grant | messages/customer_document | Document ready |
| Quote state change | `quote.accept` | messages | Document ready |
| Invoice ready | `invoice.issue_from_work_order` | reports/payment_status | Invoice ready |
| Payment state change | Payment recorded on the invoice | reports/payment_status | Payment update |
| Visit/service completion | `visit.complete` | visits/service_status | Service update |
| Visit schedule change | `visit.cancel` | visits/service_status | Schedule update |

**Expected:**

- Events whose category is **enabled** (e.g. `visits`) produce a notification on
  the device.
- Events whose category is **disabled** (`workItems`) do NOT produce a
  notification; `dispatchPushNotification` returns `dispatched: 0, skipped: 1`.
- Each delivered notification has the neutral title/body from the privacy-safe
  builders and a deep-link route under `/m` (system user) or `/access`
  (external user).
- External-user routes always resolve to `/access`; the customer must
  re-authenticate with their token to view scoped content.

**Fail when:** A disabled category still delivers; an enabled category does not
deliver; the deep link points to a desktop-only or cross-origin route; the
external-user route bypasses the customer-access session.

### Stage 9 — Multi-device subscription

1. On Device B (different browser/OS), install the PWA and complete Stages 2–3
   for the same principal.
2. On either device, open `/m/account` and inspect the Active devices list.
3. Tap **Send test** (remote) on Device A.

**Expected:**

- The Active devices list shows two subscriptions for the same principal.
- A remote test dispatches to BOTH subscriptions (one Notification + one Message,
  two MessageDeliveries + two Outbox messages).
- Both devices receive the OS notification.
- Each subscription tracks its own `last_accepted_at`.

**Fail when:** The second subscribe overwrites the first; only one device
receives the notification; the dispatch creates one MessageDelivery shared
across subscriptions.

### Stage 10 — Unsubscribe

1. On Device B, tap **Disable** push.
2. Inspect the Active devices list on both devices.

**Expected:**

- The client calls `pushManager.unsubscribe()` locally, then
  `DELETE /api/push/unsubscribe` with the `subscriptionId`.
- Device B's subscription is removed from the Active devices list (soft-deleted,
  `status = 'disabled'`).
- Device A's subscription remains active.
- A subsequent remote test delivers to Device A only.
- `DELETE /api/push/unsubscribe` rejects a `subscriptionId` belonging to a
  different principal or workspace (ownership check).

**Fail when:** Disabling one device disables both; the local unsubscribe is not
mirrored server-side; a cross-principal `subscriptionId` can disable another
user's subscription (P0/P1 security finding).

### Stage 11 — Notification privacy verification

Inspect every notification received during Stages 5, 6, and 8. For each, capture
the exact title and body text.

**Expected:**

- Titles and bodies contain NO customer name, contact name, phone, email,
  address, payment amount, invoice number, invoice line items, evidence, or
  free-form internal comments.
- Copy is a neutral invitation to open the app (e.g. "You have been assigned
  new work. Open to review.", "An invoice is available. Open to view details.").
- The same neutral copy is used regardless of how sensitive the underlying
  record is.

**Fail when:** Any notification exposes PII or financial detail; copy varies
based on record content in a way that leaks information; an error payload or raw
JSON is ever shown (malformed payloads must be silently dropped by the Service
Worker).

### Stage 12 — 404/410 subscription expiration handling

1. Force the provider to return 404 or 410 for one subscription (e.g. invalidate
   the endpoint on the provider side, or use a dev hook to simulate the
   `expired` result path in `deliverWebPushMessage`).
2. Trigger a remote push to that principal.

**Expected:**

- `deliverWebPushMessage` detects `result.expired`, calls
  `expirePushSubscription` (status moves to `expired`), and marks the outbox
  message delivered (no retry).
- The associated MessageDelivery is marked failed with
  `expired:<errorCode>` (or `expired:<statusCode>`).
- The subscription disappears from the Active devices list.
- Subsequent dispatches skip the expired subscription without retrying it.
- The other (still-active) subscription on the same principal continues to
  receive notifications normally.

**Fail when:** A 404/410 triggers unbounded retries; the subscription remains
`active` after expiry; the expired subscription is retried on every dispatch; a
transient failure (e.g. 5xx) is wrongly treated as permanent expiration.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 3 — Subscribe to push

```sql
SELECT id, principal_type, principal_id, status, endpoint, endpoint_hash,
       last_accepted_at, created_at
FROM runory_runtime_push_subscriptions
WHERE id = '<subscription-id>';
```

**Verify:** `status = 'active'`; `principal_type` is `workspace_membership` or
`customer_access_grant` and `principal_id` is set — these are derived
server-side from the session, never caller-supplied (the subscribe endpoint
accepts only `endpoint`, `p256dh`, `auth`); `endpoint` and `endpoint_hash`
are set. The `p256dh`/`auth` keys are intentionally stored in the DB for
sending, but must never appear in the `GET /api/push/status` safe view.

### After Stage 4 — Preferences configured

```sql
SELECT global_enabled, work_assignment_enabled, schedule_change_enabled,
       work_returned_enabled, approval_ready_enabled, customer_document_enabled,
       payment_status_enabled, service_status_enabled, updated_at
FROM runory_runtime_push_preferences
WHERE workspace_id = '<workspace-id>'
  AND principal_type = '<principal-type>' AND principal_id = '<principal-id>';
```

**Verify:** the UI "workItems" toggle maps to `work_assignment_enabled`, which
must be `0` after Stage 4; `global_enabled = 1` and the other six category
columns (`schedule_change_enabled`, `work_returned_enabled`,
`approval_ready_enabled`, `customer_document_enabled`,
`payment_status_enabled`, `service_status_enabled`) remain `1`. Values
survive a reload (`updated_at` advanced once, not reverted to defaults).

### After Stage 6 — Remote test push

```sql
SELECT n.id AS notification_id, n.status AS notification_status,
       m.id AS message_id, m.channel,
       md.status AS delivery_status, md.accepted_at, md.provider,
       ob.status AS outbox_status, ob.delivered_at AS outbox_delivered_at
FROM runory_runtime_notifications n
LEFT JOIN runory_runtime_messages m
  ON m.workspace_id = n.workspace_id AND m.notification_id = n.id
LEFT JOIN runory_runtime_message_deliveries md
  ON md.workspace_id = m.workspace_id AND md.message_id = m.id
LEFT JOIN runory_runtime_outbox_messages ob
  ON ob.workspace_id = n.workspace_id AND ob.correlation_id = n.id
WHERE n.id = '<notification-id>';
```

**Verify:** a notification row exists; `delivery_status = 'accepted'` with
`accepted_at` set and `provider = 'web-push'`; `outbox_status = 'delivered'`
with `outbox_delivered_at` set — the outbox processor claimed the
`message_delivery.web_push` message and the Web Push provider accepted it.
For a single-device test there should be exactly one delivery/outbox row; if
the outbox is stuck in `pending`, the push never reached the provider.

### After Stage 10 — Unsubscribe

```sql
SELECT id, principal_type, principal_id, status, updated_at
FROM runory_runtime_push_subscriptions
WHERE workspace_id = '<workspace-id>'
  AND principal_type = '<principal-type>' AND principal_id = '<principal-id>'
ORDER BY created_at;
```

**Verify:** the disabled device's subscription has `status = 'disabled'`
(soft-deleted, not hard-deleted); the other device's subscription still has
`status = 'active'`. Only the targeted `subscriptionId` was disabled —
unsubscribing one device must not disable the other, and a cross-principal
`subscriptionId` can never disable another principal's subscription.

## 8. Privacy and consistency matrix

Record the observed title/body for each notification captured during Stages 5,
6, and 8. Any cell containing PII or financial detail is a failed run.

| Source event | Title | Body | Contains PII? | Contains payment/invoice detail? | Route |
| --- | --- | --- | --- | --- | --- |
| Local test | | | YES / NO | YES / NO | |
| Remote test | | | YES / NO | YES / NO | |
| Work assigned | | | YES / NO | YES / NO | |
| Visit rescheduled | | | YES / NO | YES / NO | |
| Visit cancelled | | | YES / NO | YES / NO | |
| Work returned | | | YES / NO | YES / NO | |
| Approval needed | | | YES / NO | YES / NO | |
| Quote ready (external) | | | YES / NO | YES / NO | |
| Invoice ready (external) | | | YES / NO | YES / NO | |
| Payment update (external) | | | YES / NO | YES / NO | |
| Service update (external) | | | YES / NO | YES / NO | |

Any `YES` in the PII or payment/invoice columns is an automatic FAIL regardless
of other stage results.

## 9. Run record template

```markdown
### PWA Notifications — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Device A (browser/OS):
- Device B (browser/OS):
- System-user principal (membership id):
- External-user principal (grant id):
- VAPID configured: YES / NO
- Subscription id (Device A):
- Subscription id (Device B):
- Test notification id (remote):

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Environment and VAPID | PASS / FAIL | | |
| 1. Install PWA | PASS / FAIL | | |
| 2. Permission after gesture only | PASS / FAIL | | |
| 3. Subscribe to push | PASS / FAIL | | |
| 4. Preferences | PASS / FAIL | | |
| 5. Local test push | PASS / FAIL | | |
| 6. Remote test push | PASS / FAIL | | |
| 7. Notification click handling | PASS / FAIL | | |
| 8. P0 business events | PASS / FAIL | | |
| 9. Multi-device subscription | PASS / FAIL | | |
| 10. Unsubscribe | PASS / FAIL | | |
| 11. Privacy verification | PASS / FAIL | | |
| 12. 404/410 expiration | PASS / FAIL | | |
| Privacy matrix (no PII) | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Affected record(s):
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- No identity switching beyond documented role changes: YES / NO
- No database reset during run: YES / NO
- Real device/emulator used (not desktop-only): YES / NO
```
