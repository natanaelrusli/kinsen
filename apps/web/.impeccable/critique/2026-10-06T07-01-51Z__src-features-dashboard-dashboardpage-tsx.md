---
target: Kinsen dashboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/anb-0826009/project/kinsen/apps/web/src/features/dashboard/DashboardPage.tsx"
target_fingerprint: "sha256:df4918d1c6733f997f5e2d96bd0194f7a8e32752522c9566e7679abc11677a3d"
target_path: /Users/anb-0826009/project/kinsen/apps/web/src/features/dashboard/DashboardPage.tsx
timestamp: 2026-10-06T07-01-51Z
slug: src-features-dashboard-dashboardpage-tsx
closed: true
---
# Kinsen Dashboard Critique

Target: `apps/web/src/features/dashboard/DashboardPage.tsx` (authenticated route `/`). Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Sync/offline, loading, and error status are visible; successful mutations have no explicit confirmation. |
| 2 | Match System / Real World | 3/4 | “Safe to spend” and “Still to pay” are clear, but adjacent totals need stronger distinction. |
| 3 | User Control and Freedom | 3/4 | Edit and cancel-delete paths exist; confirmed deletion has no undo. |
| 4 | Consistency and Standards | 3/4 | Shared visual and focus patterns are coherent; tablet navigation hides destination names. |
| 5 | Error Prevention | 2/4 | Delete confirmation exists, but deletion is irreversible; similar-looking financial totals can be confused. |
| 6 | Recognition Rather Than Recall | 3/4 | Most actions and sections are labeled; tablet navigation becomes unlabeled icons. |
| 7 | Flexibility and Efficiency of Use | 2/4 | Row editing is available, but no batch/shortcut path is evident and only four recent transactions appear. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Restrained palette and focal metric work; many secondary metrics and very small labels weaken scanning. |
| 9 | Error Recovery | 2/4 | Errors surface, but failed mutations lack recovery guidance and deletion has no undo. |
| 10 | Help and Documentation | 1/4 | No contextual help or documentation entry point is visible. |
| **Total** | | **25/40** | **Acceptable (62.5%): refine the financial model’s clarity and recoverability.** |

## Design Specificity Verdict

**LLM assessment:** Kinsen has a recognizable voice: calm green/cream colors, serif display headings, and plainspoken budgeting language centered on “Safe to spend today” and the protected reserve. It feels more authored than a generic finance table. But the structure—hero metric, health card, three statistic cards, category progress, commitments, recent activity—is a familiar dashboard-card template. The product-specific distinction between spendable today and remaining for the period should organize the story more explicitly. Product and design docs are absent, so no unprovided brand intent is assumed.

**Deterministic scan:** 2 CLI findings in `src/shared/styles.css`: `overused-font` at line 3 (`font-family: Inter`) and `layout-transition` at line 162 (`transition: width`). The first is subjective and the intended font choice is unknown; the second points to a real progress-fill width transition, though its practical performance impact was not measured. Neither is a direct dashboard-component finding. The font observation aligns with the LLM’s view that the visual language has a distinct palette and language but familiar structure; the detector adds typography distinctiveness not called out by the source-only design review. No definite false positive established.

**Visual evidence:** Browser was opened on the local app but `/` resolved to the unauthenticated sign-in/create-account screen; the authenticated dashboard could not be inspected without a session. Detector injection succeeded there and the page console reported “4 anti-patterns found,” listing small/low-contrast type, cream palette, kicker/heading, tracking, and layout-transition rules. These are sign-in-screen observations, not dashboard findings, and are excluded from dashboard scoring. No user-visible authenticated-dashboard overlay is claimed.

## Overall Impression

A thoughtful, reassuring money interface with a genuinely useful centerpiece. The main flaw is users must reconcile multiple meanings of “remaining” while supporting labels are unusually small. Clarify the money model, retain tablet navigation labels, and give deletion a recovery path.

## What's Working

1. **Useful focal metric:** “Safe to spend today” is actionable, with a plain explanation that it excludes reserves and promised money (`DashboardPage.tsx:55–59`).
2. **Actionable information architecture:** New expense, budget review, commitments, allocations, and activity links appear in context; empty states offer next actions (`:51,64,70,76,87,96`).
3. **Good interaction baseline:** Shared controls have visible focus outlines; loading/errors announce status; the transaction modal handles keyboard focus and Escape; sync status uses a polite live region (`styles.css:39`, `Primitives.tsx:33–37`, `Modal.tsx:16–48`, `AppShell.tsx:75–78`).

## Priority Issues

### [P1] Tablet navigation removes visible and accessible labels
**What:** At 641–850 px, `.nav-link > span` is hidden (`styles.css:383–392`); the SVG icons are `aria-hidden` (`Icon.tsx:31`), leaving navigation links without accessible names (`AppShell.tsx:10–16,57–62`).
**Why it matters:** Screen-reader and voice-control users cannot identify destinations; sighted users must guess icons.
**Fix:** Keep names available to assistive technology and expose visible labels on focus/hover, or use a labeled compact navigation treatment. Include Budget settings and preserve active-route clarity.
**Suggested command:** `$impeccable adapt` (then `$impeccable audit`).

### [P1] Adjacent money totals can imply the wrong amount is spendable
**What:** The hero shows `safeToSpendToday`; nearby cards show actual spending, commitments, and protected reserve (`DashboardPage.tsx:57–71`). The commitments panel ends with `remainingBudget = period.totalAmount - overview.actualSpent`, labeled “Remaining after actuals” (`:36,91`). This is distinct from safe-to-spend, but appears in the same scan path.
**Why it matters:** A user could treat a period remainder as money available today, or fail to understand why it differs after commitments/reserve.
**Fix:** Keep “Safe to spend today” as the only unqualified spendable figure; qualify the period remainder with exactly what it excludes, e.g. “Budget left before commitments/reserve,” if that matches the model. Otherwise state the precise components.
**Suggested command:** `$impeccable clarify`.

### [P2] Essential supporting financial details are too small
**What:** Category and commitment details use 8–10 px, stat details 10 px (`styles.css:152–157,176–189`). These convey cadence, allocation left, due/overdue status, and amount context.
**Why it matters:** The details are needed to interpret financial figures; tiny and muted text impairs quick scanning at normal zoom, low vision, and narrow widths.
**Fix:** Raise essential labels to a comfortable readable size and contrast; reserve tiny type for nonessential metadata.
**Suggested command:** `$impeccable typeset`.

### [P2] Confirmed transaction deletion has no recovery path
**What:** A row exposes delete (`TransactionRow.tsx:23–25`); `window.confirm` allows cancellation, but once confirmed the dashboard provides no undo (`DashboardPage.tsx:39–46`).
**Why it matters:** Mistaken deletion can change the safe-to-spend calculation and cannot be reversed from this surface.
**Fix:** Provide a time-bounded Undo after deletion, identifying the deleted row and amount.
**Suggested command:** `$impeccable harden`.

## Cognitive Load

**2 checklist failures — moderate load.** Passes: chunking, grouping, hierarchy, one decision at a time, working-memory context, and progressive disclosure. Failures: **single focus**—the safe-to-spend figure shares attention with health, three summary metrics, category progress, commitments, and activity; **minimal choices**—five navigation items plus Budget settings, icon-only tablet nav, row actions, and contextual links compete at once. The labels’ ambiguity increases interpretation effort even though the numbers are co-located.

## Emotional Journey

The page opens calmly with a specific spendable number and reserve explanation. “On track” reassures; “Needs attention” and “Over budget” communicate pressure plainly. The emotional valley comes when the user compares safe-to-spend with “Remaining after actuals,” commitments, and allocations without a clear relationship. Mutation feedback is quiet, and deletion confirmation is followed by no way back.

## Persona Red Flags

**Alex (Power User):** Only four recent transactions are shown; editing/deletion is one row at a time, and no shortcuts or bulk actions are evident. Cleaning up many entries requires repeated actions and navigating to Activity.

**Sam (Accessibility-Dependent User):** At 641–850 px, visible nav labels disappear and icons are hidden from assistive tech, leaving unlabeled destinations. Essential 8–10 px detail text creates a low-vision burden. Positive: focus outlines and modal focus management are present.

**Jordan (First-Timer):** “New expense” and the safe-to-spend explanation are clear, but Jordan may not know why this differs from “Remaining after actuals” or whether commitments are excluded from either. No contextual help entry point is visible.

## Minor Observations

- The safe-card icon-only “Review budget period” link has an accessible label but is less discoverable than text links.
- Mobile bottom-nav labels are 9 px (`styles.css:398–409`); preserve legibility and touch spacing.
- Loading/error, starter-budget, empty-category, empty-commitment, empty-transaction, and overdue states have implementation coverage, but authenticated runtime states were not visually observed.
- Detector’s font warning is subjective with brand intent undocumented; its width-transition warning maps to an actual progress bar transition but impact is unverified.

## Questions to Consider

- What if Safe to spend today were the only unqualified “available” figure, and each other total stated what it excludes?
- Could tablet navigation retain destination names without permanently expanding the desktop sidebar?
- Which details must be readable at a glance, and which can wait for category/activity pages?
