# PLN Token Tracker — implementation plan

## 1. Outcome and decisions

Add an authenticated `/electricity` page to Kinsen for tracking one prepaid PLN meter: record remaining kWh, record credited top-ups and optional purchase amounts, review historical usage, and estimate depletion. Entries remain usable offline and survive reloads.

Use the workbook's balance-conservation equation, not an assumed PLN tariff. Improve correctness and explainability rather than introducing AI-generated predictions.

Chosen scope:
- One meter, manual observations and associated refill details.
- Device-local IndexedDB persistence, matching the existing asset feature. Clearly state **Saved on this device; not synced**. Budget sync status must not imply electricity sync.
- Lifetime metrics and year-aware monthly observed-period metrics.
- A lifetime-rate depletion forecast anchored to the last reading, with data-quality warnings.
- Create, edit, confirmed delete, historical insertion, and explicit same-day ordering.
- Workbook reconciliation fixtures; production uses corrected semantics, not a user-facing legacy calculation mode.

Not included: PLN networking, tariff lookup, receipt OCR, device-level energy measurement, multiple meters, automatic budget expenses, reminders, server sync, generic Excel import/export, or synthetic daily readings. These are separate product decisions, not unfinished portions of this feature.

Tradeoff: device-local delivery reuses a proven storage lifecycle and avoids inventing another sync protocol, but a second device will not have these records. Cross-device support would require API storage, account-generation handling, and explicit conflict semantics before implementation.

## 2. Source evidence

Sources inspected:
- `/Users/anb-0826009/Downloads/PLN_Token_Tracker_AI_Agent_Context.md` — formula semantics, provenance, risks, acceptance cases.
- `/Users/anb-0826009/Downloads/PLN Token Tracker.xlsx` — actual 37-row history and displayed dashboard results.
- `README.md` — offline architecture, asset locality, account ownership, reset semantics.
- `packages/budget-domain/src/date-only.ts` — existing elapsed calendar-day helpers.
- `apps/web/src/App.tsx` — lazy authenticated routes.
- `apps/web/src/shared/components/AppShell.tsx` — destinations, command search, desktop and mobile navigation.
- `apps/web/src/infrastructure/repositories/dexie-budget-repository.ts` — Dexie schema version 4 and transactional account-data clearing.
- `apps/web/src/infrastructure/repositories/asset-repository.ts` and `apps/web/src/shared/state/asset-store.ts` — repository/use-case/state separation and reset-safe asynchronous loads.

Independent Decimal arithmetic using all 37 displayed workbook records reproduced 826.82 kWh over 120 days, 6.8901666667 kWh/day, and 33.17481435 estimated days remaining. Flooring elapsed forecast days from October 2 gives November 4, 2026. Monthly results also reconcile; October has one observation and must be insufficient data in the application.

These are historical fixture values, not a current meter reading. The workbook's inferred September refill cannot be corrected numerically without the actual credited kWh or contemporaneous meter evidence.

## 3. Domain contract

Keep electricity calculations pure in the existing `@kinsen/budget-domain` package. A new package or service is unnecessary for this scope.

### Observation

| Field | Contract |
|---|---|
| `id` | Stable unique ID |
| `date` | Valid local `YYYY-MM-DD`; no future actual observations |
| `sequence` | Nonnegative integer; unique within a date; explicit event order |
| `remainingMilliKwh` | Nonnegative safe integer; meter balance after any refill attached to this observation |
| `refillMilliKwh` | Nonnegative safe integer for known/inferred credit; null for unknown or no refill, distinguished by provenance |
| `refillSource` | `none`, `entered`, `inferred_balance_difference`, or `unknown` |
| `refillCostIdr` | Nonnegative safe integer or null when unrecorded; a recorded zero is distinct from unknown |
| `note` | Optional user explanation for corrections or uncertain refills |
| `sourceReference` | Optional workbook row reference for reconciliation fixtures, not needed for manual entry |

Input parsing converts decimal text to integer milli-kWh exactly; allow up to three decimal places. Reject extra precision rather than silently rounding. Display meter inputs without losing recorded precision. Derived ratios may use floating point after exact integer accumulation; rounding is presentation-only.

Check intermediate energy sums and IDR totals for safe-integer overflow, not just individual inputs. Return an explicit invalid result rather than losing precision.

Validate source/value consistency: `none` has no credit; `entered` and `inferred_balance_difference` require a credited quantity; `unknown` has no quantity. An unrecorded purchase cost never invalidates otherwise known energy consumption.

Date plus sequence is the calculation order, never insertion timestamp or ID. First reading is always an opening snapshot. Reordering or inserting historical entries requires validating the entire resulting history, including both affected neighboring intervals.

### Results

Expose data, not formatted narrative:
- `status`: `ok`, `insufficient_data`, or `invalid_input`.
- Optional/nullable consumption, daily rate, 30-day equivalent, forecast runtime and depletion date.
- Opening/latest balances, actual observed start/end, elapsed days and record count.
- Known credited refill totals, recorded purchase totals and completeness flags.
- Structured warnings with codes and affected record IDs.
- `asOfDate` and `readingAgeDays`, separate from today's date.

Unknown credits block aggregate energy metrics and forecasts spanning that interval; do not assume unknown means zero. Negative interval consumption indicates inconsistent inputs, even if a lifetime total happens to remain positive. Preserve readable records and recorded cash totals while marking affected energy results invalid.

Recommended functions: `validateElectricityHistory`, `calculateIntervalUsage`, `calculateLifetimeMetrics`, `calculateMonthMetrics`, and `calculateDepletionForecast`. Reuse exported `daysBetween`, `parseDateOnly`, and `addDays`.

Pass `today` explicitly to validation and staleness calculations; the pure engine must not read the system clock. For unknown credit use `insufficient_data` plus `unknown_refill`; contradictory known values use `invalid_input`. Known but inferred credit may return `ok` with uncertainty warnings.

## 4. Calculation rules

### Conservation

For chronologically ordered observations, balance is post-refill:

```text
interval_usage[i] = balance[i-1] + credit[i] - balance[i]
window_usage = opening_balance + sum(credits AFTER opening observation) - closing_balance
elapsed_days = calendar_day_difference(closing_date, opening_date)
daily_usage = window_usage / elapsed_days
30_day_equivalent = daily_usage * 30
```

Exclude the opening observation's credit from energy usage because its balance already contains that credit. Its recorded purchase amount still belongs to purchase spending when its date is in the spending period.

Use exact milli-kWh arithmetic. Negative usage is an error, not a value to clamp. No tolerance is needed for binary summation error with this representation. Genuine meter/source rounding discrepancies require a visible correction or uncertainty, not silent adjustment.

### Same-day observations

Same-day before/after refill rows are valid; they can reconcile quantities but do not establish a daily rate by themselves. Their zero-day interval usage can still contribute to a larger valid observation window. Daily rate requires a positive total day span.

The input form makes the post-refill balance rule explicit and offers before/after order when another reading already exists on that date. Never derive sequence from timestamps.

### Monthly analytics

Use full `YYYY-MM`. Pick the first and last observation inside that month, excluding opening-row credit. Require observations on at least two different dates for daily and normalized metrics.

Show the observed date range and **Partial month / observed period** rather than claiming measured full-calendar-month consumption. Do not sum monthly 30-day equivalents. Do not interpolate missing month boundaries or fabricate readings.

### Spending

Sum known purchase amounts dated in the selected cash-flow period, including an opening-row purchase. Label this **Recorded refill spending**, not consumed-energy cost.

Lifetime normalized spending uses all recorded purchases between the opening and closing dates divided by their elapsed day span, multiplied by 7 or 30. Display an incomplete-spending warning when a known refill has no purchase amount. Unknown prices are not zero; rates describe recorded spending only.

No tariff, kWh-per-rupiah estimate, or automatic budget transaction is needed. Recording a purchase here must not reduce Safe to Spend or create a second expense.

### Forecast

```text
runtime_days = latest_balance / positive_lifetime_daily_usage
depletion_date = addDays(last_reading_date, floor(runtime_days))
```

Date-only input supports an approximate calendar date, not a precise depletion instant. Preserve fractional runtime until presentation; flooring is the explicit workbook-compatible date convention.

- One reading or zero elapsed days: insufficient data, no forecast.
- Positive balance and measured zero burn: daily usage is zero, depletion is indefinite, not an invented date.
- Zero latest balance: show **Empty at last reading**; zero runtime can be represented independently of whether a historical burn rate exists.
- Unknown credited refill or inconsistent interval: no energy forecast for the affected lifetime window.
- Inferred refill: show **Provisional estimate — inferred refill included**. A multi-day balance-difference refill may understate consumption and overstate runtime; the value is not a statistical confidence bound.
- Forecast is always based on the last observed date, assuming unchanged usage and no future top-ups. Show the exact age of that reading and a warning whenever it is older than today. Do not relabel 228.58 kWh as today's balance.
- If the forecast date is already past, request a new reading; do not claim the meter is actually empty.

### Refill uncertainty

Do not infer credit automatically just because the balance rose. Prefer the credited kWh from the PLN purchase receipt or a directly observed before/after refill pair.

Allow an explicit **Estimate from balance difference** action for uncertain records, with provenance and an explanation. The September source pair (25.00 → 346.74 across two days) produces 321.74 inferred kWh and zero modeled interval usage, but emits `uncertain_refill`. Same-day inference also remains marked inferred because date-only rows cannot prove zero intervening consumption.

Editing inferred or unknown credit to an actual credited amount recomputes dependent usage and forecasts. No receipt or corrected amount is available in the supplied workbook, so preserve the historical value and warning.

## 5. User experience

Use the existing application shell with **PLN Token Tracker** in desktop navigation, command search, and mobile More. Keep the current five-item mobile primary bar unchanged.

Page sections:
1. Heading, device-local storage notice, **Add reading** action.
2. Latest measured balance with reading date/age; daily usage; approximate depletion; recorded refill spending. Missing values use explicit text, not misleading zeroes.
3. Year-aware month selector with observed kWh, elapsed days, kWh/day and clearly labeled kWh/30 days.
4. Remaining-balance chart with refill markers and provenance. Upward refill spikes are not consumption spikes. A tabular alternative keeps chart information accessible.
5. Paginated history rows: date/order, remaining kWh, credited kWh, purchase IDR, provenance, edit/delete actions.
6. Contextual quality warnings linking to affected rows; explain why a rate is unavailable or provisional.

Forms support reading-only and reading-with-refill entries, actual versus inferred/unknown credit, optional cost, decimal input and same-day placement. Errors retain entered values and identify units and affected intervals. Save transactions atomically; confirmed deletion explains any resulting reconciliation issue before commit.

Allow explicit unknown credits to preserve incomplete real history with unavailable affected metrics. Block negative reconciled usage when credit is declared known; offer correcting the record or explicitly marking credit unknown, never auto-adjusting it.

Use no lifestyle classifier initially: household efficiency cannot be inferred from kWh alone. If added later, the workbook's bands must be labeled editorial guidance, never an official PLN assessment.

Astryx implementation requirements:
- Start with `pnpm exec astryx build "prepaid electricity meter tracker with metrics, balance chart, and reading history"`.
- Scaffold its closest page template inside the existing shell; preserve the template frame, gap and padding.
- Consult `astryx component <Name>` and layout/token docs before selecting props or changing structure.
- Dense history uses Table or List rows, not card-wrapped records. Status uses StatusDot/Token; Badge only counts.
- Layout uses Astryx components, no raw div/span layout, new CSS imports, hardcoded color/spacing values, or theme overrides.
- Use existing form dialogs, confirmation and pagination where compatible; keep their established keyboard/focus behavior.

## 6. Implementation phases and file ownership

### Phase 1 — domain and reconciliation

Add `packages/budget-domain/src/electricity.ts` and behavior tests; export through `src/index.ts`. Before changing exports, inspect references with the language server. Extract the 37 real workbook rows into a test fixture, preserving same-day order and C33/C40 inferred provenance; do not seed this personal history into production accounts.

Implement validation, exact energy accounting, monthly windows, recorded spending, forecast states and structured warnings. Reconcile fixture totals before connecting storage or UI.

Exit: source numbers match; deliberately improved cases return the specified typed states; no UI/persistence dependencies in the engine.

### Phase 2 — local persistence and lifecycle

Add `apps/web/src/infrastructure/repositories/electricity-repository.ts` and implement the contract in the existing Dexie repository. Add the next schema version at implementation time (currently v4) with an `electricityObservations` table indexed by ID and unique `[date+sequence]`.

Add `apps/web/src/application/use-cases/electricity-use-cases.ts` to own parsing, history-level validation, ordering and atomic mutation boundaries. Add `apps/web/src/shared/state/electricity-store.ts` using the existing Zustand loading/error/mutation pattern.

Revalidate against persisted history inside the mutation transaction, not just against stale UI state. Coordinate order changes and saves in one transaction. Persist raw observations only, not cached forecasts or derived month names.

Extend account-data clearing to include the table and subscribe the electricity store to the existing clear notification. Reset invalidates in-flight loads and pending mutations so pre-reset data cannot reappear. Verify account-gate behavior applies to the new route.

Exit: offline create/edit/delete and reload preserve history; old budget/asset data survives upgrade; reset clears electricity records and state without resurrection.

### Phase 3 — feature surface

Add `apps/web/src/features/electricity/` with page, reading form, history and balance chart sections. Follow current feature decomposition, keeping section-specific state local and financial rules in the domain.

Integrate the lazy route in `App.tsx`; update destinations, grouped navigation, command search, mobile More and icon mapping in the shared shell. No Overview widget or dashboard preference is required for this delivery.

Render every metric state, source warning and storage limitation. Recalculate after every accepted edit/delete, including historical entries. Avoid creating an alternative shell or a second date/currency formatting convention.

Exit: complete reading-to-metric path is usable on mobile and desktop, online and offline, without affecting budget calculations.

### Phase 4 — proof and documentation

Run domain, repository and relevant existing UI checks after integration. Then launch the application and exercise the actual route; unit tests alone do not establish delivery.

Update README with navigation, post-refill interpretation, forecast assumptions, device locality, and account-reset behavior. Remove throwaway validation scripts. Keep fixture and consumer-visible regression tests.

## 7. Acceptance and verification

| Scenario | Expected behavior |
|---|---|
| Full 37-row workbook | Opening 68.00; latest 228.58; refills 987.40; consumption 826.82 kWh; 120 days; daily ~6.8901666667; recorded spending IDR 1,500,000; 7/30-day recorded rates IDR 87,500/375,000; runtime ~33.17481435; approximate date 2026-11-04; inferred-refill warning |
| June / July / August / September | Daily rates ~7.41538462 / 6.62862069 / 7.14285714 / 6.50826087; ranges and elapsed days displayed |
| October singleton | Insufficient data; no daily rate, 30-day projection or finite forecast; latest balance and recorded spending remain visible |
| July 29 same-day refill | 19.00 + 332.86 − 351.86 = 0; stable before/after order; no standalone daily rate |
| September two-day inferred refill | Historical 321.74 retained; modeled zero interval usage; explicit uncertainty and provisional forecast |
| Opening row already refilled | Opening credit excluded from consumed kWh; purchase still counted in its cash period |
| Missing refill / rising balance | Explicit unknown accepted with blocked affected energy results; known-none claim rejected as inconsistent |
| Negative intermediate interval but positive lifetime usage | Invalid affected energy result, not a plausible-looking forecast |
| Zero burn / zero duration / empty meter | Distinct states, no divide-by-zero or fabricated date |
| Cross-year and unsorted input | October 2026/2027 separated; date/sequence sorting deterministic |
| Precision and invalid data | Exact decimal accumulation; reject negative/unsafe/fractional-IDR inputs, invalid dates, duplicate IDs and order collisions |
| Partial calendar coverage | Show observed period; never present normalized usage as measured full-month total |
| Optional purchase cost | Unknown cost stays unknown; recorded spending marked incomplete; energy still calculated if credited kWh is known |
| Historic corrections and deletion | Both adjacent intervals revalidated; all affected metrics update; no half-written reorder |
| Offline and reload | Add/edit/delete persists on the same device without network; no claim of server synchronization |
| Existing database upgrade | Budget, assets, liabilities, pending operations and generation metadata preserved |
| Account reset during load/save | New table cleared, state emptied, obsolete load/save cannot restore records |
| Stale / past forecast | Last measured date retained; age shown; past projection requests a fresh reading without claiming actual depletion |
| Navigation and accessibility | Direct route, search, desktop/More navigation; labeled inputs, keyboard dialogs, readable chart alternative; mobile and both themes |
| Budget separation | Reading and refill purchase never create budget expenses or change Safe to Spend |

Verification commands: `pnpm test`, `pnpm build`, and relevant existing e2e coverage through `pnpm test:e2e` after adapting only affected behavior contracts. Add deterministic domain/repository tests for numeric boundaries, reconciliation and reset ordering; avoid tests of static labels or internal component wiring.

Browser smoke: open `/electricity`; create an opening reading; add a known refill and later reading; verify displayed conservation and forecast; edit a historical credit; test same-day order and uncertainty; go offline and reload; confirm persistence; delete with confirmation; reset account data and confirm empty state. Review narrow/wide layouts and light/dark themes. Use a disposable account/database for destructive smoke scenarios.

Completion requires all named acceptance rows plus actual browser proof. The supplied readings are sufficient for reproducible fixture tests, but insufficient to discover the true September credited kWh; that limitation remains a visible domain warning, not an implementation blocker.
