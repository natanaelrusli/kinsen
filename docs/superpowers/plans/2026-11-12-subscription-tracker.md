# Subscription Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #10: an offline-first subscription tracker whose renewals, payments and history agree with Kinsen's budget and calendar.

**Architecture:** Persist subscriptions and immutable schedule/price segments in the existing budget snapshot and sync outbox. Project segments into PlannedExpense rules, so the current occurrence engine remains the single source for reservations and fulfillment. Route UI and MCP mutations through shared application use cases, retaining the existing local asset-debit transaction boundary.

**Tech Stack:** TypeScript, React 19, Astryx 0.6.5, Zustand, Dexie, Express, node:sqlite, Zod, Vitest, Testing Library, Playwright; pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-11-12-subscription-tracker.md` (read before implementing); source [issue #10](https://github.com/natanaelrusli/kinsen/issues/10).

## Global Constraints

- Node >=22.13.0; pnpm 11.24.0; TypeScript, React 19, Zustand, Dexie, Express, node:sqlite, Zod, Vitest and Playwright. No new runtime dependencies.
- All budget money is whole IDR; all scheduling dates are validated local `YYYY-MM-DD` dates.
- Offline mutations commit locally with their queued sync operation atomically; subscriptions participate in budget snapshot conflict, import, replacement, reset and account-generation handling.
- Keep existing owner authorization and generation headers on every new API mutation.
- Asset accounts and linked asset entries remain device-local; this feature does not implement issue #13.
- Use Astryx templates and components; no raw div/span layout, new CSS imports, utility classes or hardcoded colors/spacing. Preserve the selected template frame, gaps and padding.
- Follow fast-iteration: write focused tests with each task; do not run suites/builds/linters per edit. Narrow unit tests are optional while iterating; run the full relevant gate immediately before push/MR.

## Review Focus

1. Month-end and leap-year anchors must recover their original day after clamping; old anchors must not cause unbounded expansion (Task 1).
2. Repeated clicks, offline replay and two devices marking the same renewal must converge on one transaction; payment deletion must restore the reservation (Tasks 2–4).
3. Pause, cancellation, deletion and price/category changes must preserve paid links and prior obligations, including a payment made today (Tasks 1–4).
4. Legacy snapshots, whole-copy sync decisions and account reset must preserve or intentionally clear subscriptions without silently dropping them (Tasks 2–3).
5. A synced subscription's device-local Paid from id may be missing or archived; require an explicit account decision before any payment write (Tasks 4–5).

---

## File structure and contracts

New focused domain files:
- `packages/budget-domain/src/subscriptions.ts`: exported Subscription, SubscriptionSegment, SubscriptionSummary, SubscriptionReminder and SubscriptionSummaryRow types, validation, transitions, cost summaries and projection.
- `packages/budget-domain/src/subscriptions.test.ts`: domain fixtures and date/lifecycle/cost tests.
- `packages/budget-domain/src/recurrence.ts`: shared bounded recurrence-date enumeration.

Modify `model.ts`, `engine.ts`, `index.ts`, `sample.ts` and `engine.test.ts` in the same directory for snapshot compatibility and combined occurrences. Re-export subscription interfaces through `index.ts`; use `import type` for the model/subscriptions type relationship.

Persistence follows existing classes rather than a parallel store:
- Modify `apps/api/src/db/database.ts`, `apps/api/src/http/{schemas,app}.ts`, `apps/api/src/repositories/sqlite-budget-repository.ts`, `apps/api/src/__tests__/api.test.ts`.
- Modify `apps/web/src/infrastructure/repositories/{budget-repository,pending-budget-operation,dexie-budget-repository,api-budget-repository}.ts`, both existing repository test files, and `apps/web/src/infrastructure/api/budget-api-client.ts`.
- Add `apps/web/src/application/use-cases/subscription-use-cases.ts` and `.test.ts`; modify `budget-use-cases.ts` for payment routing and subscription-owned rule guards.

New UI files in `apps/web/src/features/subscriptions/`: `subscription-catalog.ts`, `SubscriptionsPage.tsx`, `SubscriptionForm.tsx`, `SubscriptionDetail.tsx`, `SubscriptionReminders.tsx`, `useSubscriptionToday.ts` and `SubscriptionsPage.test.tsx`, `SubscriptionForm.test.tsx`, `useSubscriptionToday.test.ts`. Add `apps/web/e2e/subscription-tracker.spec.ts`.

Modify `apps/web/src/App.tsx`, `shared/components/AppShell.tsx` and its test, `features/budget/BudgetPage.tsx`, `features/commitments/{CommitmentsPage,CommitmentCard}.tsx`, and `features/transactions/TransactionForm.tsx` plus existing tests; update `features/commitments/PlannedExpenseForm.tsx` and its test for the two additional cadences. Add `CommitmentsPage.test.tsx` for ownership routing. Calendar consumes the combined overview; add assertions to its existing test without rewriting its UI.

MCP modifies `packages/mcp-contract/src/index.ts`, adds `packages/mcp-contract/src/subscriptions.ts` for reusable input schemas, modifies `apps/web/src/application/mcp/execute-tool.ts` and its test, and `apps/mcp/src/bridge.test.ts` for transport coverage. `createMcpServer` already registers the shared tool map dynamically; do not add a separate registration mechanism.

Types and signatures below are planned additions, not existing APIs. Exact Subscription/SubscriptionSegment fields, lengths, statuses, nativePrice and amount semantics are specified in the companion spec. No application runtime changes belong in this planning branch until execution is approved.

### Task 1: Subscription domain, lifecycle and recurrence projection

**Files:** Create `packages/budget-domain/src/{subscriptions.ts,subscriptions.test.ts,recurrence.ts}`; modify `packages/budget-domain/src/{model.ts,engine.ts,engine.test.ts,index.ts,sample.ts}`.

**Interfaces:**
- Consumes: existing `BudgetSnapshot`, `PlannedExpense`, `PlannedOccurrence`, `Transaction`, date-only helpers and `calculateOverview(snapshot, today)`.
- Produces: `normalizeBudgetSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot & { subscriptions: Subscription[] }` (also normalizes nullable/optional serialization consistently); `subscriptionPlannedExpenses(subscriptions: readonly Subscription[]): PlannedExpense[]`; `validateSubscriptions(snapshot: BudgetSnapshot): void`.
- Produces: `recurrenceDates(anchor: DateOnly, cadence: RecurrenceCadence | null, start: DateOnly, end: DateOnly): DateOnly[]`; expand RecurrenceCadence to all four specified cycles.
- Produces: `changeSubscriptionStatus(subscription: Subscription, status: 'PAUSED' | 'CANCELLED', today: DateOnly, transactions: readonly Transaction[]): Subscription`; `resumeSubscription(subscription: Subscription, segment: SubscriptionSegment, today: DateOnly): Subscription`; `replaceSubscriptionSegment(subscription: Subscription, segment: SubscriptionSegment, today: DateOnly, transactions: readonly Transaction[]): Subscription`; `validateSubscriptionChange(previous: Subscription | undefined, next: Subscription, today: DateOnly, transactions: readonly Transaction[]): void`.
- Produces: `SubscriptionSummaryRow = { subscriptionId: string; name: string; status: Subscription['status']; monthlyCostIdr: number; yearlyCostIdr: number; nextRenewalDate: DateOnly | null }`; `SubscriptionReminder = { id: string; subscriptionId: string; dueDate: DateOnly; kind: 'TRIAL' | 'RENEWAL' | 'OVERDUE'; amountIdr: number }`; `SubscriptionSummary = { rows: SubscriptionSummaryRow[]; monthlyCostIdr: number; yearlyCostIdr: number; activeCount: number; pausedCount: number; cancelledCount: number; upcoming7Days: PlannedOccurrence[]; upcoming30Days: PlannedOccurrence[]; categoryMonthlyCosts: { categoryId: string; amountIdr: number }[]; reminders: SubscriptionReminder[] }`.
- Produces: `summarizeSubscriptions(snapshot: BudgetSnapshot, today: DateOnly): SubscriptionSummary`, expanding an explicit 30-day horizon independently of budget period. Row cost fields retain fractions; aggregate/display rounding follows the spec.

- [ ] **Step 1: Write domain tests** using fixture builders in `subscriptions.test.ts`, and integration assertions in `engine.test.ts`. Pin the following named cases with these assertions:

```ts
// netflix_monthly_reserves_once
expect(summary.monthlyCostIdr).toBe(120000)
expect(summary.yearlyCostIdr).toBe(1440000)
expect(overview.outstandingCommitments).toBe(120000)
// yearly_shared_plan
expect(summary.monthlyCostIdr).toBe(50000)
expect(summary.yearlyCostIdr).toBe(600000)
// month_end_recovers_anchor
expect(recurrenceDates('2027-01-31', 'MONTHLY', '2027-01-01', '2027-03-31'))
  .toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
// leap_day_recovers_anchor
expect(recurrenceDates('2028-02-29', 'YEARLY', '2029-01-01', '2032-12-31'))
  .toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
```

Also assert quarterly Jan31→Apr30→Jul31, weekly totals for 12000 = 52000/month and 624000/year, zero share yields zero occurrences, combined fractional equivalents round only once, positive finite FX validation, and invalid categories, dates, duplicate segment ids and segment overlaps throw. Assert the 7/30-day boundaries include today+6/+29 and exclude +7/+30; trial reminder starts 2026-11-17 for end 2026-11-20 and lead 3. Assert an old anchor (2000-01-31) projects correctly into November 2026 with bounded month jumps. Add lifecycle cases for pause/resume gaps, same-day payment retention, cancelled/deleted paid history, invalid backdated edits and preventing category removal referenced only by closed segments.

- [ ] **Step 2: Implement exported types, validation, lifecycle and cost helpers** in `subscriptions.ts` using the exact spec data fields; add optional subscriptions to BudgetSnapshot and optional subscriptionId to projected expense/occurrence. Validate currency arithmetic and safe integer sums, historical immutability against the previous record and transaction links against a real projected occurrence date.
- [ ] **Step 3: Implement recurrence and engine integration** in `recurrence.ts`/`engine.ts`: bounded start-index calculation from original anchor, shared date enumeration, manual plus projected rules, unchanged fulfillment semantics and no persisted duplicate commitments. Normalize sample snapshots and exports. Reserve `subscription:` rule ids from manual writes at application/API boundaries; projection itself is allowed to use them.
- [ ] **Step 4: Optionally run the narrow date regression**: `pnpm --filter @kinsen/budget-domain exec vitest run src/subscriptions.test.ts -t month_end_recovers_anchor --reporter=dot`. Expected: that case passes; defer full suites to Task 7.
- [ ] **Step 5: Commit** only this task's listed files: `git commit -m "feat: model subscription schedules and budget projections"` after staging them explicitly.

### Task 2: Server persistence, migration and validated endpoints

**Files:** Modify `apps/api/src/db/database.ts`, `apps/api/src/repositories/sqlite-budget-repository.ts`, `apps/api/src/http/{schemas,app}.ts`, `apps/api/src/__tests__/api.test.ts`.

**Interfaces:**
- Consumes: Task 1 domain types/projection/normalization/validation.
- Produces: `SqliteBudgetRepository.saveSubscription(subscription: Subscription, effectiveDate: DateOnly): void`; `deleteSubscription(id: string, effectiveDate: DateOnly): void` (soft deletion); reads include subscriptions.
- Produces: `PUT /api/subscriptions/:id` with `{subscription: Subscription, effectiveDate: DateOnly}` body and `DELETE /api/subscriptions/:id` with `{effectiveDate: DateOnly}`. Responses follow existing `{snapshot}` mutation convention. Current owner and generation middleware applies; id mismatch is 400. Validate histories against stored records, including generic transaction writes.
- Produces: snapshot response `budgetSchemaVersion: 2`; require `X-Kinsen-Budget-Schema: 2` on all budget writes (including reset/import/replace); incompatible or absent header returns 426 `BUDGET_SCHEMA_UPGRADE_REQUIRED`. Web update is Task 3. This prevents an old cached client replacing a snapshot and dropping subscriptions; deploy server and client together.

- [ ] **Step 1: Add API tests**: open a v3 fixture DB, migrate and retain all manual budget rows; round-trip a Netflix subscription with two historical segments; POST legacy snapshot import without subscriptions reads back `[]`. Assert wrong-owner and stale-generation calls fail, spoofed history and reserved manual ids fail, malformed native prices fail, and retrying the same PUT creates one record. Assert soft delete preserves existing linked transactions and derived rules; generic payment writes with a second id for the same subscription occurrence fail. Assert replace/reset clears subscriptions intentionally and rolls back all tables on failure. Assert older-client writes return 426 and cannot discard subscriptions.
- [ ] **Step 2: Add schema v4 migration**: new `subscriptions(id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)))` storing a fully validated JSON record; no duplicated rules. Keep foreign category references enforced by domain validation. Rebuild categories/planned_expenses cadence CHECK constraints to allow QUARTERLY/YEARLY, preserving transaction foreign keys, indexes and all data. Use the existing migration transaction pattern, test `foreign_key_check`, and keep schemaV1–V3 unchanged.
- [ ] **Step 3: Extend repository read/import/replace/reset/comparison paths** and implement save/delete, using the recorded mutation effectiveDate and domain change validation. Snapshot validation includes projected rule links; SQL writes retain transactions referencing subscription projected ids by adding a new nullable subscription link representation rather than inserting projection rows: rebuild transactions so manual planned_expense_id retains its FK, add subscription_id FK to subscriptions and subscription_segment_id, map external plannedExpenseId from/to the deterministic projected id, and CHECK that manual/subscription links are mutually exclusive and include an occurrence date. Soft deletion keeps the subscription row. Snapshot inserts order subscriptions before their transactions; reset deletes transactions first.
- [ ] **Step 4: Add Zod schemas, routes and compatibility gate** with strict input objects, legacy subscriptions default `[]`, exact id checks, existing HttpError conventions, and authorization/generation protection. Validate effectiveDate is a valid date no later than server-local today. Compare against stored history and paid links, and use that recorded date for prospective-change rules so offline mutations replay without changing their meaning. The browser supplies local today at mutation time; never replace it with sync time.
- [ ] **Step 5: Commit** this task's files: `git commit -m "feat: persist subscriptions through the budget API"`. Tests are written; full API verification runs in Task 7.

### Task 3: IndexedDB and offline synchronization

**Files:** Modify `apps/web/src/infrastructure/repositories/{budget-repository,pending-budget-operation,dexie-budget-repository,api-budget-repository}.ts`, `apps/web/src/infrastructure/api/budget-api-client.ts`, existing `dexie-budget-repository.test.ts` and `api-budget-repository.test.ts`.

**Interfaces:**
- Consumes: Task 1 types/validation, Task 2 endpoints and schema version.
- Produces: BudgetRepository methods `saveSubscription(subscription: Subscription, effectiveDate: DateOnly): Promise<void>` and `deleteSubscription(id: string, effectiveDate: DateOnly): Promise<void>`; Dexie implements them, ApiBudgetRepository delegates then requests sync.
- Produces: pending operation variants `{kind:'SAVE_SUBSCRIPTION'; subscription:Subscription; effectiveDate:DateOnly}` and `{kind:'DELETE_SUBSCRIPTION'; id:string; effectiveDate:DateOnly}` with existing queue metadata; BudgetApiClient corresponding methods and required schema header.

- [ ] **Step 1: Extend repository tests**: upgrade a v5 IndexedDB fixture, verify empty subscriptions and unchanged assets; save while offline atomically stores subscription+outbox and survives reload. Reconnect replays once, acknowledges queue and compares equal server/device snapshots. Fail the outbox write and assert record rollback. Repeat for delete, price edit, two local queued edits, parked imports, server/device conflict choice, reset and newer data generation. Legacy omitted and explicit empty subscriptions compare equal; differing segments must compare different. Assert 426 is a visible update-required error with operations retained; an older server lacking budgetSchemaVersion does not receive subscription writes.
- [ ] **Step 2: Add Dexie v6 subscriptions table** (`id, status, deletedAt`), getSnapshot/read/write/clear/replace/adopt/seed paths and transaction table scopes; normalize old queued IMPORT_SNAPSHOT payloads. Save/delete validate against current stored snapshot inside the write transaction, then enqueue the exact resulting change. For saves and deletions replayed on a later date, preserve the recorded effectiveDate and validate against the stored record and paid links; never regenerate transitions relative to replay time. Add tests saving a subscription offline before its first renewal and syncing after that renewal date.
- [ ] **Step 3: Wire client and sync dispatch**, capability check and generation headers. Include subscriptions in canonicalSnapshot, isEmptySnapshot and difference descriptions in both local sync and API equality paths. Existing whole-copy conflict decisions apply to subscriptions too. Do not clear local asset data when adopting subscription snapshots.
- [ ] **Step 4: Commit** this task's files: `git commit -m "feat: sync subscription records offline"`. Full repository suites run in Task 7.

### Task 4: Shared subscription commands and idempotent payment

**Files:** Create `apps/web/src/application/use-cases/subscription-use-cases.ts` and `.test.ts`; modify `budget-use-cases.ts`, `dexie-budget-repository.ts` and its test, and `sqlite-budget-repository.ts`/API tests where payment guards live.

**Interfaces:**
- Consumes: BudgetRepository, existing assetRepository, Task 1 transitions, existing `saveTransaction(transaction, paidFromAssetId)` atomic debit path.
- Produces: `SubscriptionUseCases` constructor `(repository: BudgetRepository)`; `save(subscription: Subscription, today: DateOnly): Promise<void>`; `setStatus(id: string, status: 'PAUSED'|'CANCELLED', today: DateOnly): Promise<void>`; `resume(id: string, segment: SubscriptionSegment, today: DateOnly): Promise<void>`; `remove(id: string, today: DateOnly): Promise<void>`; `markPaid(input: SubscriptionPaymentInput): Promise<Transaction>`.
- Produces: `SubscriptionPaymentInput = { subscriptionId:string; segmentId:string; dueDate:DateOnly; paymentDate:DateOnly; paidFromAssetId:string|null }`; deterministic transaction id from the spec. paidFromAssetId is required nullable so missing-account fallback is explicit.

- [ ] **Step 1: Add command tests** with fixture budget 3000000, reserve 0, Netflix 120000 due 2026-11-15 and an active ledger account. Mark twice concurrently and assert one transaction, one debit, no second outbox transaction, actualSpent +120000, outstandingCommitments -120000 and unchanged safeToSpendToday. Delete its transaction and assert reservation restored. Assert stale account, archived account, wrong segment, non-occurrence date, trial early payment, date outside period and malicious duplicate-id links reject without partial writes. A retry with a different paymentDate returns the original payment unchanged. Preserve partial manual commitment payment behavior.
- [ ] **Step 2: Implement command class** using current stored snapshots and domain validation. Keep lifecycle transitions centralized; UI/MCP construct next records through these helpers. Use crypto ids only for new records/segments; never for the deterministic payment id.
- [ ] **Step 3: Make subscription payment creation atomic** inside Dexie saveTransaction: resolve current projected occurrence, read existing deterministic transaction before any debit rewrite, insert only if absent, and enqueue only on creation. Route generic TransactionForm subscription creation through markPaid; editing an existing payment uses existing saveTransaction with the stable id and explicit account selection. Server saveTransaction must also treat identical deterministic-id retries as no-op, reject conflicting same-id contents with 409 and avoid silent last-writer changes on initial replay; intentional payment edits use a distinct explicit update operation. Add `updateSubscriptionPayment(transaction: Transaction, paidFromAssetId?: string | null): Promise<void>` and `PUT /api/subscription-payments/:id` for intentional edits, queue `UPDATE_SUBSCRIPTION_PAYMENT` with transaction payload, guarded by existing link/id validation. Creation continues through ordinary SAVE_TRANSACTION and is insert-or-compare; UI edits dispatch the explicit method, retaining the local asset-debit synchronization behavior.
- [ ] **Step 4: Commit** this task's files: `git commit -m "feat: record subscription renewals exactly once"`. Full suites run in Task 7.

### Task 5: Subscription page, forms, lifecycle and reminders

**Files:** Create the UI files listed under File structure; modify `apps/web/src/App.tsx`, `shared/components/AppShell.tsx` and test, and `features/budget/BudgetPage.tsx` plus its test.

**Interfaces:**
- Consumes: useBudgetStore snapshot/overview/runMutation, Task 4 SubscriptionUseCases instantiated with existing budgetRepository, asset state and Task 1 summaries.
- Produces: `SubscriptionsPage(): React.JSX.Element`; `SubscriptionForm({open, initial, onClose}: {open:boolean; initial:Subscription|null; onClose:()=>void}): React.JSX.Element`; `SubscriptionDetail({subscription,today}: {subscription:Subscription;today:DateOnly}): React.JSX.Element`; `SubscriptionReminders({reminders}: {reminders:SubscriptionReminder[]}): React.JSX.Element`; `useSubscriptionToday(): DateOnly`.
- Produces: catalog `subscriptionCatalog: readonly {id:string; name:string; icon: string; plans:readonly string[]}[]`, with no provider-price defaults. `/subscriptions` is lazy-loaded inside existing authenticated routing.

- [ ] **Step 1: Write component tests**: select Netflix preset, enter 120000 monthly and renewal 2026-11-15, submit and assert exact domain record. Create custom service; yearly/my-share equivalent 50000; trial reminder copy; price history after replacement; search/status filtering/counts and no-budget/no-scheduled-category recovery. Verify pause/cancel/resume/delete confirmations and unchanged payment history. Assert stale Paid from requires choice, explicit unlinked payment is accepted, validation errors keep dialog data, and saving disables repeat submission. Test mobile navigation and keyboard labels. Test local midnight and focus refresh with fake timers; cleanup timers/listeners on unmount. Budget editor protects categories referenced by closed subscription segments.
- [ ] **Step 2: Scaffold the page** from `pnpm --dir apps/web exec astryx template table-filter --type page src/features/subscriptions/SubscriptionsPage.tsx`. This template was selected by `astryx build` during planning. Before adapting it, read `pnpm --dir apps/web exec astryx docs layout --full` and `docs tokens`; remove template demo data, nested app shell and unrelated saved-query controls while preserving its content frame/gap/padding. Use the existing AppShell route wrapper. Consult `astryx component <Name>` for each unfamiliar prop. Do not run astryx init (the app is already configured).
- [ ] **Step 3: Implement form and detail components** using FormWizardDialog, shared CurrencyAmountField/date/select fields and Zod/react-hook-form. Surface full price and my share, manual FX, trial first-charge rule, scheduled category, local Paid from, plan/notes and replacement-anchor changes. New subscription form requires a positive post-trial full price; allow zero my share. Render history with rows; no Card-wrapped subscription lists.
- [ ] **Step 4: Implement overview/reminders and route wiring**: labelled post-trial equivalents, 7/30-day charge totals, category split, statuses, derived next renewal, in-app reminder rows and overdue states. Add sidebar section, mobile More destination and command search entry using existing registries. Hook load/focus/midnight updates; cancelled/deleted rows retain readable history. Refresh budget and asset state after mutation using existing store patterns; no second persisted subscription store.
- [ ] **Step 5: Commit** this task's files: `git commit -m "feat: add subscription tracker page and reminders"`. UI/e2e suites run in Task 7.

### Task 6: Existing commitments, payment form and MCP integration

**Files:** Modify `apps/web/src/features/commitments/{CommitmentsPage,CommitmentCard}.tsx`, create `CommitmentsPage.test.tsx`; modify `features/transactions/TransactionForm.tsx` and test, `features/calendar/CalendarPage.test.tsx`; modify `packages/mcp-contract/src/index.ts`, create `packages/mcp-contract/src/subscriptions.ts`; modify `apps/web/src/application/mcp/{execute-tool.ts,execute-tool.test.ts}`, `apps/mcp/src/bridge.test.ts`.

**Interfaces:**
- Consumes: Task 1 subscriptionId occurrence ownership, Task 4 commands and Task 5 route.
- Produces: shared MCP inputs `kinsen_list_subscriptions({includeDeleted?:boolean})`, `kinsen_save_subscription({subscription:Subscription})`, `kinsen_delete_subscription({id:string,effectiveDate:DateOnly})`, `kinsen_mark_subscription_paid(SubscriptionPaymentInput)`; existing `ToolCall` discriminated union infers from the tools registry.
- Produces: list `{subscriptions:Subscription[]; summary:SubscriptionSummary}` using local today; save/delete return current snapshot; mark-paid returns `{transaction:Transaction}`. Destructive metadata and authorization convention match existing tools.

- [ ] **Step 1: Add integration tests**: subscription calendar row and identical outstanding budget totals; owned commitment edit/delete leads to subscription route instead of opening a blank generic expense form; record-payment from commitments or transaction form uses Task 4 command, and generic manual expenses still work. MCP list/save/delete/mark-paid work offline, malformed inputs are rejected, historical tampering is rejected and retries give one payment. Check transport exposes all four names and subscriptions are included in budget reads.
- [ ] **Step 2: Wire owned occurrence actions** to subscription editing/confirmation and shared markPaid. Default preferred Paid from only when locally valid; otherwise show explicit selection. Keep defaultCadence schemas consistent across API/MCP/category validation when adding QUARTERLY/YEARLY; existing budget editor may retain its weekly/monthly default choices, but must preserve stored quarterly/yearly values during edits. Allow the existing manual commitment form to represent the newly supported quarterly/yearly cadence options (modify its schema/select and existing PlannedExpenseForm.test.tsx), and update shared MCP planned-expense cadence schemas/descriptions too. Audit all cadence switches so yearly never falls through to monthly.
- [ ] **Step 3: Implement shared MCP schemas and handlers** with exact spec limits, field names and same use-case paths as UI. Require explicit paidFromAssetId:null for an unlinked payment. Do not add new authentication/transport machinery; refresh stores after mutation. Add deletion confirmation metadata using existing destructive convention. Keep browser/server bridge protocol intact because tools are registry-driven.
- [ ] **Step 4: Commit** this task's files: `git commit -m "feat: connect subscription actions to commitments and MCP"`. Full verification follows once in Task 7.

### Task 7: End-to-end acceptance and release gate

**Files:** Create `apps/web/e2e/subscription-tracker.spec.ts`; modify `README.md` to document subscriptions, manual rates, local account limitations, in-app-only reminders and coordinated schema-v2 deployment.

**Interfaces:**
- Consumes: complete `/subscriptions` flow and existing Playwright API/dev-server fixture conventions from `apps/web/e2e/critical-flow.spec.ts` and `electricity-tracker.spec.ts`.
- Produces: repeatable acceptance coverage and release evidence; no new production interfaces.

- [ ] **Step 1: Write e2e scenarios**: add Netflix 120000/month, check tracker/calendar/Safe to Spend; mark paid twice and assert one transaction/debit; edit price to 140000 at the next renewal and keep past payment; pause/resume without backfill; annual shared PS Plus equivalent; trial reminder; offline reload then reconnect; legacy budget migration; missing-account payment choice. Exercise the subscription table/dialog at desktop and mobile sizes using existing Playwright projects. Assert no horizontal viewport overflow and keyboard access to row actions.
- [ ] **Step 2: Review complete diff against spec** and the five Review Focus items. Check no requirement lacks a test, new schedule identifiers and schemas agree across layers, subscriptions participate in every reset/import/conflict path, no secrets/provider-price claims are introduced, and new UI satisfies Astryx token/component rules. Update the README deployment instructions before publishing.
- [ ] **Step 3: Run the full gate immediately before push/MR**: `pnpm build`, then `pnpm test`, then `pnpm test:e2e`. Root scripts provide the build/type-check and workspace test gates; no standalone lint script/CI workflow exists in the inspected tree. Expected: all workspaces build, all unit/component/API tests pass, all configured e2e projects pass. Use the repository's existing documented Clerk/test environment; report any environment blocker instead of claiming a pass. Fix failures and rerun affected gates until green.
- [ ] **Step 4: Commit** acceptance coverage and documentation: `git commit -m "test: cover subscription tracker acceptance flows"` after staging only listed files. Record real verification output in the PR description if a PR is requested. Push/opening a PR is a later execution action, not part of this planning request.

## Planning self-review

- Scope coverage: catalog/custom, four cycles, native pricing/my share, lifecycle, trials/history, summaries/category split, reminders, budget/calendar/payment, offline/server sync and MCP map to Tasks 1–7; detection and push stay in their own issues.
- Interface consistency: domain and repository additions are explicitly named; occurrence and transaction ids derive from subscription+segment+date; local asset ownership remains explicit.
- Review Focus: date behavior is Task 1; payment/replay Tasks 2–4; history Tasks 1–4; legacy/reset Tasks 2–3; missing assets Tasks 4–5.
- Verification scheduling follows the project's fast-iteration override rather than per-task suite runs. This planning task ran no tests/builds and changed no runtime code.

## Execution handoff

Review this plan and companion spec before implementation. Recommended approach: **Subagent-driven**, because the seven tasks span financial calculations, two storage engines, sync and UI/MCP interfaces; independent review can catch history loss and duplicate-payment mistakes before later tasks build on them. **Native** remains available: implement in this session and perform a fresh whole-branch review at the end.
