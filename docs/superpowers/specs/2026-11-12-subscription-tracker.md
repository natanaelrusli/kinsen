# Subscription Tracker Design

Status: proposed for review; implementation has not started.
Source: [GitHub issue #10](https://github.com/natanaelrusli/kinsen/issues/10).

## Outcome and scope

Provide `/subscriptions` for manually tracking Netflix, PlayStation Plus, Disney+/Hotstar and other recurring services. Include custom services, plan/notes, recurring costs, trials, in-app reminders, history, payment-account preference and MCP access. Renewals reserve budget through `generateOccurrences` and appear in the existing calendar. Recording payment replaces that renewal's outstanding reservation with actual spending exactly once.

Exclude transaction-based subscription detection (#16), background/push notifications (#22), automatic cancellation, live provider pricing, automatic exchange rates, reimbursement collection and shared household permissions (#19). Shared-plan support means tracking the user's monetary share, not collecting other people's payments. These are separate features, not prerequisites.

## Existing architecture and constraints

- Node >=22.13.0; pnpm 11.24.0; TypeScript, React 19, Zustand, Dexie, Express, node:sqlite, Zod, Vitest and Playwright. No new runtime dependencies.
- All budget money is whole IDR; all scheduling dates are validated local `YYYY-MM-DD` dates.
- Offline mutations commit locally with their queued sync operation atomically; subscriptions participate in budget snapshot conflict, import, replacement, reset and account-generation handling.
- Keep existing owner authorization and generation headers on every new API mutation.
- Asset accounts and linked asset entries remain device-local; this feature does not implement issue #13.
- Use Astryx templates and components; no raw div/span layout, new CSS imports, utility classes or hardcoded colors/spacing. Preserve the selected template frame, gaps and padding.
- Follow fast-iteration: write focused tests with each task; do not run suites/builds/linters per edit. Narrow unit tests are optional while iterating; run the full relevant gate immediately before push/MR.

## Data and lifecycle

Add optional `subscriptions?: Subscription[]` to `BudgetSnapshot`; normalize missing values to `[]` at every storage/API/comparison boundary for compatibility with existing snapshots and queued imports. Require an existing budget and a SCHEDULED category to create a subscription. Allow renewal anchors beyond the current period; the tracker/reminders work across periods while budget commitments remain clipped to the current period.

`Subscription` contains `id`, `name` (1–80 trimmed characters), `providerId` (preset slug or `custom`), `plan` (up to 80 characters), `notes` (up to 2000), `status` (`ACTIVE | PAUSED | CANCELLED`), optional `paidFromAssetId`, optional `trialEndDate`, `reminderDays` (integer 0–30, default 3), `segments` and optional `deletedAt` (DateOnly). Trial is a date attribute of ACTIVE, not a fourth lifecycle status.

`SubscriptionSegment` is the immutable historical price/schedule record: `id`, `categoryId`, `dueDate` (original anchor), optional inclusive `endDate`, `cadence` (`WEEKLY | MONTHLY | QUARTERLY | YEARLY`), `grossAmountIdr` (positive safe integer), `myShareIdr` (safe integer 0 through gross amount), optional `nativePrice: { currency: string; amount: number; rateToIdr: number }`. Native currency is an uppercase three-letter code other than IDR; native amount/rate must be positive finite numbers, and `Math.round(amount * rateToIdr)` must equal grossAmountIdr. Rates are entered manually and locked into the segment. myShareIdr is the amount reserved and paid; zero-share segments create no financial occurrences. Store full provider price separately from my share; display both. No inferred division or automatic reimbursement.

New subscription: one open segment; trial's first charge anchor must equal trialEndDate, with no reservation or payment before that date. Catalog supplies names, local Lucide icon keys, and editable example plan names, never prices. Include Netflix, PlayStation Plus, Disney+/Hotstar, Spotify, YouTube Premium, iCloud and ChatGPT plus Custom. Plan names are suggestions, not a claim of current provider availability.

Price/plan/share/currency/category/cycle/anchor change: choose a replacement next-renewal anchor on or after today; close the prior open segment on the preceding date and append a new segment with a new stable id. Keep all older segment values and paid links. Reject changes that would remove, reprice, recategorize or reschedule a paid occurrence, overlapping segments, anchors preceding today, and adding an active segment to PAUSED/CANCELLED records. Display price history from segments; metadata-only name/notes/account edits preserve their ids.

Pause/cancel: effective today, close the open segment yesterday (drop a never-started, unpaid segment instead of making an invalid interval). Retain earlier unpaid obligations and all payments. Same-day already-paid occurrences are preserved by keeping a closed segment through today; this also keeps today's scheduled charge if already paid. Resume PAUSED only: require a new anchor on or after today and append a segment; never backfill paused days. CANCELLED cannot resume; create a new subscription to restart. Soft delete sets deletedAt and applies cancellation; hide from normal lists, retain history and transactions. Repeated delete is idempotent.

Offline saves/deletes carry the original effectiveDate in their API envelope and outbox payload. Server validates it is no later than server-local today and validates the change against stored history/paid links. A delayed sync must not move the cancellation date or reject a once-future anchor merely because it is now past. Concurrent conflicting changes use existing whole-copy conflict resolution.

Publish budgetSchemaVersion 2 with snapshots and require X-Kinsen-Budget-Schema: 2 on budget mutations. Older clients receive 426 BUDGET_SCHEMA_UPGRADE_REQUIRED; new clients block writes to servers without version 2. Deploy server and client together; this prevents whole-copy replacement silently dropping subscriptions.

## Projection and recurrence

Do not persist duplicate subscription commitments. `subscriptionPlannedExpenses(subscriptions)` projects every nonzero historical segment into an ordinary PlannedExpense with id `subscription:<subscriptionId>:<segmentId>`; add optional subscriptionId to the projected expense and occurrence. Retain closed segments, including deleted records, for historical transaction validation and past occurrences. Generic planned-expense writes must reject this reserved id namespace.

`generateOccurrences` expands manual and projected expenses together. Weekly steps seven days; monthly/quarterly/yearly step 1/3/12 months from the original day, clamping missing days to month end. February 29 yearly billing returns to February 29 in leap years. Bound expansion to the current period and segment end; avoid iterating from an old anchor one day/month at a time when the period is years later. Validate transaction links against manual plus projected expenses, including exact occurrence dates, matching categories and deterministic subscription transaction ids. Budget category removal must protect historical segment references. Projection ids are represented as subscription/segment foreign keys in SQLite transactions, separate from the existing manual planned-expense FK; do not persist duplicate subscription rules merely to satisfy that FK.

Payment id is `subscription-payment:<subscriptionId>:<segmentId>:<dueDate>`. One subscription occurrence has at most one transaction. Mark paid uses the projected amount, category and due date; actual payment date defaults to today and must lie within the current budget period. Refuse paid dates before trial end. Existing payment returns the same transaction unchanged on a local retry. Server replay of identical transaction content is a no-op; differing content under the same deterministic id returns 409 for conflict resolution. Intentional payment edits use a separate updateSubscriptionPayment command and /api/subscription-payments/:id endpoint, retaining id and occurrence link, rather than the creation replay path. Generic saveTransaction rejects another id linked to the same subscription occurrence; editing a recorded payment retains its stable id and valid link. Deleting the transaction restores outstanding reservation. Pausing, deleting, price changes and payment retries never remove paid history. No automatic debit at renewal time.

Paid from: validate against active LEDGER accounts on this device at payment time using existing transaction/asset-entry validation. An unavailable stored account shows “Choose an account on this device”; require a replacement or explicit “No linked account”. Do not auto-create missing assets or silently unlink. Subscription payment and local asset debit/outbox write are atomic. Replayed API transactions do not create asset debits remotely.

## Overview, reminders and UI

Show recurring equivalents for ACTIVE, nondeleted records using the segment applicable to the next charge: weekly ×52/12 monthly and ×52 yearly; monthly ×1/×12; quarterly ÷3/×4; yearly ÷12/×1. Sum unrounded equivalents then round to whole IDR once at presentation. Trial rows include their post-trial price in totals labelled “After trials”; the next charge still occurs only at trial end. PAUSED/CANCELLED/deleted are excluded. Show equivalent totals separately from actual charges due in the next 7/30 days. Category split uses my share, matching equivalents. Status counts include active, paused and cancelled; deletion is hidden by default.

Upcoming uses local today through today+6 / today+29 inclusive, can work beyond the budget period, includes all unpaid dates, and excludes fulfilled ones. In-app reminders include unpaid renewal/trial events once dueDate-reminderDays <= today <= dueDate; retain overdue unpaid renewal notices separately. Trial copy is “Cancel before <date>”. Compute on app load, tab focus and local midnight while open; make no background-delivery promise. Closing a reminder need not persist dismissal in this release.

Use Astryx `table-filter` template within the existing AppShell, a row-based subscription collection, text search, status filter, compact summary facts, next-renewal section and a detail/history pane. Add/edit uses the existing FormWizardDialog pattern. Include pause/resume/cancel/delete confirmation, retryable save errors, empty/no-budget/no-scheduled-category states, and an explicit route to budget setup without changing allocations automatically. Desktop/sidebar, mobile More and command search must reach the page. Keyboard/screen-reader labels and mobile overflow follow existing application patterns. Subscription occurrences route edit/delete to subscription controls, not generic commitment forms.

## MCP

Add `kinsen_list_subscriptions` (includeDeleted=false), `kinsen_save_subscription` (complete Subscription), `kinsen_delete_subscription` (id, effectiveDate), and `kinsen_mark_subscription_paid` (subscriptionId, segmentId, dueDate, paymentDate, paidFromAssetId:string|null). Writes use the same validated application/repository paths as the UI. delete requires the existing destructive authorization convention. Save validates history preservation against the existing record; do not trust caller-supplied historical changes. List returns records and the same derived summary/reminders as UI. Refresh budget/asset state after mutations. Existing MCP server discovers tools from the shared contract.

## Acceptance examples

Netflix 120000 IDR/month, first renewal 2026-11-15: monthly 120000/yearly 1440000; one November reservation 120000. Mark paid twice: one transaction and one local debit; actual spending rises 120000, outstanding falls 120000, Safe to Spend stays the same.

PlayStation Plus 1200000 IDR/year with my share 600000: monthly equivalent 50000/yearly 600000. A future renewal outside the budget appears in tracker/reminders but does not reserve today's budget.

Trial ending 2026-11-20, reminder 3: reminder begins November 17 and no charge before November 20. A January 31 monthly anchor renews February 28 and March 31; a 2028-02-29 yearly anchor renews 2029-02-28 and 2032-02-29.
