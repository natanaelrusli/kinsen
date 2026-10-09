# Kinsen UI Audit and Implementation Plan

**Status:** Implemented and verified; mobile calendar grid/details dialog included; one residual P2 recorded  
**Product:** Kinsen Daily Budget Planner  
**Platform:** React web app, desktop and mobile  
**Scope:** Preserve the incumbent UI and product behavior while correcting the findings below.

## 1. Executive summary

### Baseline implementation integrity verdict

At baseline, the UI expressed a coherent, finance-specific system: a clear information hierarchy, semantic themes, consistent navigation, and established form and dialog patterns. It was not release-ready on the audited criteria because of financial input coercion, accessibility failures, irreversible selection, and misleading chart spacing. The follow-up implementation and audit are recorded below.

The initial Impeccable detector flagged only the use of Inter. This is not treated as a technical defect: changing the font would not resolve the verified problems.

### Baseline score

| Category | Score / 4 | Assessment |
| --- | ---: | --- |
| Accessibility | 2 | Light-mode contrast failures, wizard focus loss, nested main landmarks |
| Performance | 2 | Large initial bundle; source-confirmed scaling and network-coupling risks |
| Responsive | 3 | No sampled horizontal overflow; some calendar targets are narrow for comfortable touch |
| Theming | 3 | Stable sampled dark screens; Crisp corners inconsistently applied |
| Implementation integrity | 2 | Financial input coercion, irreversible selection, misleading chart spacing |
| **Total** | **12 / 20** | **Acceptable** |

Score bands: 18–20 Excellent; 14–17 Good; 10–13 Acceptable; 6–9 Poor; 0–5 Critical.

**Findings:** 0 P0, 2 P1, 9 P2, 1 P3. Findings UI-08 and UI-09 are source-only performance risks, not measured runtime failures.

Severity interpretation:

- **P0:** Critical blocker; no findings at this level.
- **P1:** Fix before release because of financial correctness or material accessibility impact.
- **P2:** Important interaction, accessibility, data presentation, or performance issue.
- **P3:** Theme consistency and maintainability issue.

## 2. Baseline evidence, coverage, and limitations

### Exercised surfaces and conditions

- Overview, Calendar, Commitments, Activity, Budget, Settings, Assets, and representative forms in Chromium.
- Phone, phone landscape, tablet, and desktop layouts; sampled widths from 320 to 1440 CSS pixels.
- Light and dark samples, reduced motion, and Settings at 200% text size.
- Automated accessibility checks with axe-core 4.13.0, supplemented by manual interaction and focus checks.
- Existing production bundle artifacts and source inspection for route loading, histories, synchronization, and chart positioning.

### Evidence labels

- **Runtime:** Behavior or geometry exercised in the browser.
- **Automated:** Reported by axe on the inspected surface.
- **Artifact:** Observed in an existing production build; not a fresh build performed for the audit.
- **Source:** Directly established by inspected implementation.
- **[INFERENCE]:** Expected impact not reproduced or benchmarked.

### Limits

- Account and authentication flows were source-reviewed, not exercised destructively.
- No real-device Safari validation or exhaustive WCAG certification was performed.
- Large-account performance and slow-network behavior were not load-tested.
- Passing sampled dark-mode screens does not establish that every theme combination passes.
- The baseline audit did not change code; implementation followed as a separate pass. Temporary browser preference changes were restored.
- Source locations below are audit-time references and may shift after implementation.

## 3. Baseline findings register

All source paths in this section are relative to `apps/web/src/`.

### UI-01 — Invalid expense amounts silently become valid amounts

**Priority:** P1  
**Category:** Forms / correctness  
**Evidence:** Runtime + source  
**Location:** `shared/components/AstryxFields.tsx:144–154,196–210`

Typing `-500` or `0.5`, then leaving the expense amount field, changed the value to `1`. Minimum clamping runs before validation and silently replaces the entered financial value.

**Impact:** An invalid financial amount can become a different, valid amount without explanation.

**Implementation:** Preserve the entered value through blur and Enter. Let the existing positive-whole-number validation reject invalid amounts. Audit all callers of the shared amount field before changing its behavior; do not substitute another number as recovery.

**Acceptance:** Negative and fractional expense amounts remain visible, block submission, and receive actionable inline errors. Valid positive whole amounts still save unchanged. Keyboard submission and blur behave consistently.

**Suggested command:** `$impeccable harden`

### UI-02 — Light-mode labels fail text contrast requirements

**Priority:** P1  
**Category:** Accessibility  
**Evidence:** Automated + runtime  
**Location:** `shared/theme.ts:88–91`; `shared/styles.css:63,82,90` and calendar outside-month styles

Measured contrast: page eyebrows 3.59:1; enabled adjacent-month calendar dates 3.41:1; sidebar labels 4.48:1. These fall below WCAG 1.4.3's 4.5:1 requirement for normal text. The enabled dates do not qualify for the disabled-control exemption.

**Implementation:** Use readable semantic muted-text colors, not disabled-text colors. Correct theme definitions and their consumers rather than introducing per-screen raw colors. Measure against the actual composed background.

**Acceptance:** The affected normal text reaches at least 4.5:1 in light mode. Dark-mode counterparts retain required contrast. Enabled adjacent-month dates remain clearly distinguishable without relying on low contrast alone.

**Suggested command:** `$impeccable harden`

### UI-03 — A selected commitment cannot be unlinked

**Priority:** P2  
**Category:** Interaction  
**Evidence:** Runtime + source  
**Location:** `features/transactions/TransactionForm.tsx:195–203`; `shared/components/AstryxFields.tsx:229–252`

After selecting Rent, the selector offered commitments but no “Not linked” option or clear action. Backspace did not clear the selection.

**Implementation:** Add an explicit empty option using the existing “Paid from” selector pattern. Use the model's existing empty-value representation; avoid parallel clearing conventions.

**Acceptance:** Pointer and keyboard users can select a commitment and return to “Not linked.” Saving an unlinked edit removes the association without deleting the transaction or changing its amount.

**Suggested command:** `$impeccable harden`

### UI-04 — Wizard validation and step transitions lose focus

**Priority:** P2  
**Category:** Accessibility  
**Evidence:** Runtime + source  
**Location:** `shared/components/FormWizard.tsx:55–75,95–124` and asset-form validation callbacks

Submitting an empty asset-details step left focus on the document body. Advancing to Opening value also left focus on the body rather than the new step heading or input. This makes keyboard orientation and error recovery unreliable; focus order is relevant to WCAG 2.4.3.

**Implementation:** On failure, focus the first invalid field or a linked error summary. On successful step changes, focus the new step heading and reset the wizard body scroll where needed. Ensure custom fields forward the focus reference required by the form library. Reuse existing dialog containment and focus restoration.

**Acceptance:** Invalid Continue and final Save actions move focus to an actionable error destination. Forward and backward step navigation announces the new context. Focus remains in the modal, and dismissal restores focus to the trigger. Long or scrolled steps do not obscure the focused destination.

**Suggested command:** `$impeccable harden`

### UI-05 — Budget nests a main landmark inside another main landmark

**Priority:** P2  
**Category:** Accessibility  
**Evidence:** Automated + source  
**Location:** `features/budget/BudgetPage.tsx:206`

The page's `<main>` is inside AppShell's `role="main"`. Axe reported nested and duplicate main landmarks. This is a landmark-structure issue, not an assertion that every reported best-practice warning independently establishes a WCAG failure.

**Implementation:** Use an appropriate section/layout component for Budget content and retain AppShell as the single main landmark.

**Acceptance:** Budget exposes exactly one main landmark. The page heading, section labels, and existing main-content navigation remain intact. The nested/duplicate-main axe findings disappear.

**Suggested command:** `$impeccable harden`

### UI-06 — Asset charts space observations by index rather than date

**Priority:** P2  
**Category:** Data visualization  
**Evidence:** Source  
**Location:** `features/assets/AssetLineChart.tsx:18–20`; `features/assets/AssetDetailPage.tsx:52–72`

Equal index-based spacing represents irregular valuation dates as equal intervals. A one-day gap and a month-long gap can occupy the same width; same-day revisions can appear temporally separated.

**Implementation:** Map horizontal positions to elapsed calendar time using the app's local-date semantics. Keep the horizontal scale consistent with the displayed date range. Handle single-date ranges and same-day observations explicitly without changing valuation aggregation or inventing intermediate data.

**Acceptance:** Irregular intervals occupy proportional widths. Same-day points share their temporal position and have a defined display policy. Single-point and zero-duration ranges produce finite coordinates. Existing titles, descriptions, summaries, and bounded chart sampling are retained.

**Suggested command:** `$impeccable harden`

### UI-07 — All routes contribute to a large initial JavaScript payload

**Priority:** P2  
**Category:** Performance  
**Evidence:** Artifact + source  
**Location:** `App.tsx:5–14`

The existing production artifact is approximately 1.34 MB minified / 401 KB gzip. Route pages are eagerly imported, so users download code for screens they have not opened. No load-time improvement was measured in the audit.

**Implementation:** Split route modules with React lazy loading and appropriately reserved Suspense fallbacks. Preserve the current shell, route contracts, authentication behavior, and navigation. Preload likely destinations only where evidence justifies it.

**Acceptance:** A fresh production build shows route chunks and a smaller initial entry dependency payload than a fresh pre-change baseline built with identical configuration. Deep links, authenticated navigation, reloads, browser Back, and failed/slow chunk loading remain usable. Fallbacks do not create material layout shifts.

**Suggested command:** `$impeccable optimize`

### UI-08 — Transaction and asset histories grow without bounded rendering

**Priority:** P2  
**Category:** Performance  
**Evidence:** Source; runtime impact [INFERENCE]  
**Location:** `features/transactions/TransactionsPage.tsx:28–46`; `features/assets/AssetDetailPage.tsx:185–186`; expanded histories in `features/assets/AssetsPage.tsx`

Filtering scans all transactions on each keystroke, repeatedly looks up categories, and renders all matches. Histories render all records. Large-account latency and scrolling degradation are plausible but unmeasured.

**Implementation:** First profile representative large histories in an isolated fixture. Pre-index category lookups and avoid redundant filtering work. Use accessible pagination as the conservative default if bounded rendering is required; use windowing only when measurements justify its added focus and accessibility complexity.

**Acceptance:** Record before/after input-to-paint and scrolling observations under the same dataset/device conditions. Search results, ordering, totals, editing, deletion, and access to every record remain correct. Pagination/windowing does not trap focus or hide records from keyboard users.

**Suggested command:** `$impeccable optimize`

### UI-09 — Cached budget availability and local mutations wait for network synchronization

**Priority:** P2  
**Category:** Performance / feedback  
**Evidence:** Source; slow-network impact [INFERENCE]  
**Location:** `shared/state/budget-store.ts:45–49`; `infrastructure/repositories/api-budget-repository.ts:37–78`

Initialization awaits synchronization before exposing readiness. Local writes also await remote synchronization. A slow request may prolong loading or save feedback despite available local data; delayed-network scenarios were not exercised.

**Implementation:** Reproduce with a delayed request before changing the lifecycle. Separate authorized local availability from background synchronization only after existing ownership and data-generation checks make that safe. Distinguish local save completion from pending/failed remote sync in the existing status UI. Do not expose another account's cached data or blindly parallelize account-reset-sensitive initialization.

**Acceptance:** Authorized cached data remains usable during a delayed remote request. A locally committed mutation has accurate local-save feedback while pending sync stays visible. Retry/reconnect does not duplicate transactions. Account mismatch, reset, and data-generation transitions retain their existing protections; no stale account data flashes on screen.

**Suggested command:** `$impeccable optimize`

### UI-10 — Calendar touch targets narrow to approximately 37–40 px

**Priority:** P2  
**Category:** Responsive interaction  
**Evidence:** Runtime  
**Location:** `features/calendar/CalendarPage.tsx:119–124` and calendar breakpoint rules

Measured day widths were 37.4 px at a 320 px viewport, 37.1 px at 768 px, and 40.3 px in phone landscape. They meet WCAG 2.5.8's 24 px minimum but fall below the skill's 44 px comfortable-touch goal. The tablet two-column layout contributes.

**Implementation:** Adjust calendar region widths, column count, gutters, and gaps within the existing template frame. Preserve date controls and keyboard behavior. If seven columns cannot provide comfortable targets at the smallest width without overflow, use an accessible agenda alternative rather than overlapping hit areas.

**Acceptance:** The supported narrow/tablet/landscape layouts provide 44 px touch targets or an explicit comfortable-touch alternative. Dates, month navigation, selected state, and event access remain usable. There is no horizontal page overflow and no new calendar-specific gesture requirement.

**Suggested command:** `$impeccable adapt`

### UI-11 — Activity loses its search context when navigating away and returning

**Priority:** P2  
**Category:** Navigation  
**Evidence:** Runtime + source  
**Location:** `features/transactions/TransactionsPage.tsx:24`; `shared/components/AppShell.tsx:294–301`

A populated search became empty after navigating to Overview and returning to Activity. Search is route-local state; the shell also resets scroll on pathname changes. Browser Back behavior was not separately verified.

**Implementation:** Preserve Activity's search using the existing router/state conventions, with URL-backed query state for shareable/deep-linked search. Scope return-state restoration to this interaction; do not add a global scroll framework unnecessarily. Differentiate fresh forward navigation from return navigation.

**Acceptance:** Navigating away and returning preserves the query and filtered results. Reload/deep linking preserves a URL-backed query. Browser Back/Forward restores expected query and scroll state without stale results or focus hidden behind fixed navigation.

**Suggested command:** `$impeccable harden`

### UI-12 — Crisp corners leave some mobile panels rounded

**Priority:** P3  
**Category:** Theming / implementation consistency  
**Evidence:** Runtime + source  
**Location:** `shared/styles.css:654,697`

With Crisp selected, the theme radius token was 0 px, but mobile section blocks remained 16 px rounded. Mobile form sections similarly use a fixed radius. Breakpoint overrides bypass the selected theme.

**Implementation:** Replace these fixed overrides and equivalent affected surfaces with the appropriate existing semantic radius tokens. Preserve intentional circles, logos, and pill-shaped status elements.

**Acceptance:** Crisp and Rounded apply consistently to affected desktop and mobile panels. Accent/surface/typography preferences remain independent. No raw per-component color or radius values are introduced as a second theme system.

**Suggested command:** `$impeccable adapt`

## 4. Baseline systemic patterns and strengths

### Patterns to address

- Validation and focus ownership are split between shared fields, wizard navigation, and form-specific callbacks. Fix shared contracts, then migrate all affected callers.
- Some muted labels and mobile overrides bypass semantic intent: disabled text is used for enabled information, and fixed radii override user preferences.
- Date presentation and chart geometry have diverged. Keep calendar-time semantics explicit rather than relying on array order.
- Route loading, list rendering, and synchronization have no clear separation between immediate user work and deferred work. Measure and bound the affected paths without adding unrelated infrastructure.

### Existing strengths to preserve

- No horizontal overflow on sampled phone, tablet, landscape, and desktop surfaces.
- Mobile bottom navigation stayed within the viewport.
- Settings fit at 200% text size without main-content or navigation overflow.
- Stable dark-mode calendar and asset-form samples had no axe violations.
- Invalid BCA setup submission focused the first invalid field.
- Existing labels, inline errors, native dialog semantics, undo/confirmation patterns, and chart descriptions provide an accessibility foundation.

## 5. Implementation sequence

The checkboxes record completed implementation and verification work; the original baseline findings and score above remain unchanged.

### Phase 1 — Release-priority correctness and accessibility

**Findings:** UI-01, UI-02  
**Primary areas:** Shared amount fields, transaction form validation, theme definitions, text-color consumers

- [x] Capture failing-before behavior for invalid expense values and affected contrast pairs.
- [x] Fix amount preservation and migrate every affected shared-field caller.
- [x] Replace affected text-color mappings with readable semantic tokens.
- [x] Exercise valid/invalid amounts through blur, Enter, and Save; inspect settled light/dark states.
- [x] Update behavior-focused regressions and existing user-facing documentation where needed.

**Exit gate:** Both P1 findings satisfy their acceptance criteria; no silent financial substitution remains; affected enabled text passes contrast.

### Phase 2 — Interaction recovery and accessible navigation

**Findings:** UI-03, UI-04, UI-05, UI-11  
**Primary areas:** Transaction selectors, shared wizard, custom field focus refs, Budget landmark, Activity/router state

- [x] Add reversible commitment selection using the existing empty-option convention.
- [x] Define shared wizard error and step-focus behavior; update all affected wizard forms.
- [x] Remove the nested Budget main landmark without changing the shell frame.
- [x] Preserve Activity search and return-navigation context.
- [x] Run a complete keyboard flow including invalid steps, correction, forward/back navigation, Save, and dismissal.

**Exit gate:** Users can recover from selections and errors without restarting, keyboard focus remains meaningful, Budget has one main landmark, and Activity context survives navigation.

### Phase 3 — Data presentation and mobile consistency

**Findings:** UI-06, UI-10, UI-12  
**Primary areas:** Asset chart coordinates, calendar responsive layout, mobile radius rules

- [x] Implement elapsed-date chart positioning with same-day and zero-duration handling.
- [x] Adjust calendar layout/targets without altering the incumbent page frame or desktop hierarchy; retain the mobile date grid and show selected-day details in a dialog.
- [x] Replace affected fixed mobile radii with semantic tokens.
- [x] Inspect desktop and mobile together, including narrow portrait, landscape, tablet, Crisp/Rounded, and light/dark.

**Exit gate:** Time spacing is truthful, calendar interactions are comfortable at supported sizes, and corner preference is consistently applied.

### Phase 4 — Measured performance improvements

**Findings:** UI-07, UI-08, UI-09  
**Primary areas:** Route modules, transaction/asset histories, local/remote state lifecycle

- [x] Record a fresh production payload baseline, large-history interaction baseline, and delayed-network behavior before editing.
- [x] Introduce route-level splitting while retaining usable loading/error states.
- [x] Reduce repeated category lookup/filter work and bound history rendering if measurements warrant it.
- [x] Decouple authorized local readiness/save feedback from background sync while retaining account/reset protections.
- [x] Compare production payload and interactions under identical conditions; exercise reconnect, failure, and account-transition behavior.

**Exit gate:** Route splitting reduces initial payload; history changes demonstrate a measured benefit without result/focus regressions; local availability improves without weakening authorization or synchronization integrity.

### Phase 5 — Final proof and polish

**Findings:** All 12  
**Primary areas:** Changed surfaces and shared callers

- [x] Complete the verification matrix below and record evidence against every acceptance criterion.
- [x] Run the affected existing unit/contract tests, production build, and relevant existing end-to-end flows.
- [x] Run one batched desktop/mobile visual inspection; fix discovered issues together and confirm in at most one additional visual round.
- [x] Remove temporary fixtures/profiling scaffolds and update existing docs/changelog for completed behavior changes.
- [x] Follow the Impeccable polish/audit references manually and record results; the installed CLI does not expose `polish` or `audit` subcommands.

**Exit gate:** Every finding is resolved or explicitly reclassified with evidence. No score increase is claimed without a new audit.

## 6. Verification matrix

| Area | Required scenarios | Evidence to retain |
| --- | --- | --- |
| Amount correctness | Negative, fractional, zero, valid whole amount; blur, Enter, Save; shared callers | Entered/submitted values, focused error destination, failing-before/passing-after behavior |
| Commitment selection | Select, unlink, save, reopen; pointer and keyboard | Persisted association and unchanged amount/transaction identity |
| Wizard focus | Invalid Continue/Save; correct errors; next/back step; long scrolled step; dismiss | Active element, error/heading announcement, focus restoration |
| Accessibility | Affected light/dark contrast pairs; Budget landmarks; changed forms | Contrast ratios, axe findings, manual keyboard results |
| Chart time | Irregular dates, same-day observations, single observation, zero-duration range | Date-proportional positions, finite geometry, retained accessible summary |
| Responsive | 320/375 portrait mobile grid and date dialog, 768 tablet, phone landscape, 1440 desktop | Target dimensions, dialog detail/focus restoration, no page overflow, fixed-nav clearance, screenshots |
| Theme and text | Crisp/Rounded; light/dark; 200% text; reduced motion | Settled styles, legible content, visible focus, usable navigation |
| Navigation state | Activity → other page → Activity; reload; deep link; Back/Forward | Query, matching results, scroll/focus restoration |
| Production loading | Fresh baseline and changed build with identical config; route/deep-link navigation; slow/failed chunks | Initial entry dependency sizes, chunk requests, fallback/error behavior |
| Large histories | Identical isolated representative dataset before/after; search and record actions | Dataset size, device/throttling conditions, input-to-paint/scroll observations, accessible record access |
| Local/remote lifecycle | Authorized cached startup; delayed request; offline/reconnect; failed sync; account mismatch/reset | Local readiness/save state, remote status, no duplicate writes or cross-account data exposure |

### Follow-up implementation and audit

| Dimension | Score / 4 | Evidence |
| --- | ---: | --- |
| Accessibility | 3 | Changed contrast pairs exceed 4.5:1 in sampled light/dark states; wizard focus, form errors, and one main landmark verified. No final axe run or exhaustive WCAG certification. |
| Performance | 3 | Initial entry reduced 31.2% minified and 30.0% gzip versus baseline; history DOM bounded to 50 records. Entry still exceeds Vite's 500 kB warning threshold. |
| Responsive design | 3 | No overflow across sampled 320–1440 CSS-pixel widths; mobile grid targets measured 44.28×44 px at 320 and 52.14×44 px at 375, with date-detail dialogs. Chromium emulation only. |
| Theming | 3 | Sampled Crisp/Rounded and light/dark combinations use the semantic tokens; 200% text was covered in the baseline audit, not repeated after implementation. |
| Implementation integrity | 4 | Changes preserve Kinsen's finance-specific patterns and existing route, data, and account boundaries. The Inter detector warning is an intentional incumbent-font false positive. |
| **Total** | **16 / 20** | **Good** |

**Follow-up findings:** 0 P0, 0 P1, 1 P2, 0 P3. The original baseline score remains 12/20 with 0 P0, 2 P1, 9 P2, and 1 P3.

**Implementation integrity verdict:** UI-01 through UI-12 were implemented. The original financial, accessibility, selection, chart, responsive, navigation, history, and sync issues are addressed in the changed paths. UI-07 is reclassified as a residual P2 optimization opportunity: route splitting reduced the initial payload, but the entry remains large.

**[P2] Initial entry chunk remains above 500 kB.** The latest production build reports 918.72 kB minified / 280.41 kB gzip for the entry chunk, down from the baseline 1,336.11 kB / 400.71 kB. This is a 417.39 kB (31.2%) minified and 120.30 kB (30.0%) gzip reduction. The build still emits Vite's >500 kB warning. User-perceived load time was not measured; further splitting should be driven by measured route dependencies and runtime evidence.

**Detector result:** The single `impeccable detect apps/web` pass reported only overused Inter in `apps/web/src/shared/styles.css:3`. This is an intentional incumbent font, not a defect; no second detector pass was run. Impeccable context found no `PRODUCT.md` or `DESIGN.md`; the existing UI remains the authority.

**Verification evidence and limits:**

- Amounts: manual `-500` Enter submission preserved the entered value, kept the dialog open, and surfaced errors; valid positive amount save passed E2E. Fractional and zero-value validation remains covered by the existing behavior tests.
- Wizard: invalid long-scrolled Budget Save marked and focused `categories.0.name`; the nested field-path matcher also has a regression unit test. Browser checks verified step focus, Back focus, and dialog-trigger restoration.
- Accessibility: sampled contrast measured 4.75:1, 4.92:1, and 4.68:1 in light mode; 8.20:1, 6.48:1, and 7.57:1 in dark mode. Budget exposes one main landmark. No final axe rerun.
- Charts and responsive UI: same-day, irregular-date, singleton, and zero-duration cases are tested. Manual viewport samples included 320, 375, 768, 844×390, 1024, 1100, 1101, and 1440 CSS pixels; no horizontal overflow was observed. The mobile topbar has a 12 px token gap after the safe-area inset; its controls start at 12 px in the 320/375 Chromium samples, while the 1440 desktop layout is unchanged. Reduced-motion emulation retained usable state changes.
- Calendar UI-10: at 320 and 375 CSS px, the seven-column grid and weekday row remain visible; measured day targets are 44.28×44 px and 52.14×44 px respectively, with no page overflow. Clicking a date opens an accessible dialog with its date, totals, and planned detail; Escape closes it and restores focus. Add Expense transitions to one transaction dialog with the selected date. At desktop width, date details remain inline with no dialog.
- Gates: `pnpm --filter @kinsen/web test` passed (14 files, 46 tests); `pnpm --filter @kinsen/web test:e2e` passed (15 tests); the final production build passed. Build warnings remain for the >500 kB entry chunk and Rollup's removal of Zod purity-comment annotations.
- Histories: with 1,000 transactions and 1,001 asset entries, rendered histories were capped at 50 records; measured document height changed from 67,510 to 3,928 px for Activity and from 65,005 to 4,214 px for Asset Detail. Search returned all matching records. Timing methods differed, so no input-to-paint or scroll-latency comparison is claimed.
- Sync and routing: unit tests cover delayed cache startup, queued writes, generation/account mismatch, and reset while syncing. E2E covers Activity deep-link/search/Back/Forward and route flows. A production-preview reload was not verified because Clerk external JavaScript was blocked (`ERR_BLOCKED_BY_CLIENT`).
- Limits: Chromium viewport emulation is not physical-device Safari testing; large-account load timing and full WCAG certification remain unmeasured.

**Impeccable CLI availability:** `impeccable --help` exposes `detect`, `ignores`, `help`, `install`, `link`, and `update`. The `$impeccable polish` and `$impeccable audit` workflow references were followed manually; they are not executable subcommands in this installation.

### Existing repository commands

Run these from the repository root during implementation, not merely to validate this document:

```bash
pnpm --filter @kinsen/web test
pnpm --filter @kinsen/web build
pnpm --filter @kinsen/web test:e2e
```

- The web build script performs TypeScript project checking and Vite production bundling; its prebuild builds the budget-domain package.
- The existing end-to-end script invokes Playwright; its pre-script builds the API. Confirm the configured environment before running integration flows.
- Use focused existing tests while investigating each defect; batch broader verification after an implementation phase rather than repeatedly running every check after small edits.
- Add permanent tests only for consumer-visible behavior, boundaries, transitions, and error recovery. Do not assert source text, component wiring, incidental wording, or bundle filenames.
- Tests and compilation do not replace a real browser smoke run of each changed path.

## 7. Scope guardrails

- Preserve factual copy, financial calculations, existing routes, authentication contracts, and the incumbent visual identity unless a listed finding requires a change.
- Keep budget Safe to Spend separate from assets/net worth. Do not modify valuation aggregation or financial ownership semantics as a chart-layout shortcut.
- Reuse Astryx components, existing template regions, and semantic tokens. Consult Astryx layout documentation before frame changes and component documentation before changing component contracts.
- Do not add a second styling system, replace Inter to satisfy a popularity warning, or introduce unrelated validation, telemetry, retries, or abstractions.
- Preserve account isolation, data-generation/reset checks, local persistence, synchronization integrity, and accessible dialog behavior.
- Do not treat passing axe samples as proof of complete accessibility, a smaller bundle as proof of runtime speed, or a proposed improvement as verified implementation.

## 8. Applied workflow order

These workflow references were followed manually; their command-style names are not executable subcommands in the installed Impeccable CLI.

1. **Harden:** financial correctness, contrast, reversible selections, focus, landmarks, chart semantics, and navigation state.
2. **Adapt:** calendar targets and theme-driven mobile corners.
3. **Optimize:** route loading, bounded histories, and synchronization lifecycle.
4. **Polish:** visual consistency after functional fixes.
5. **Audit:** follow-up evidence and score.
