# Kinsen Asset Tracker — Product Requirements Document

**Status:** Draft for implementation  
**Product:** Kinsen Daily Budget Planner  
**Feature area:** Assets and net worth  
**Primary audience:** Individuals tracking cash, savings, and investments manually

## 1. Summary

Add an offline-first asset tracker to Kinsen so users can record where their money and other assets are held, see current values, and understand how those values change over time. Asset tracking complements the daily budget: it gives a broader view of financial position while preserving a clear boundary between **wealth** and **money safe to spend in the current budget period**.

The feature must make it easy to answer:

- What do I own, and where is it held?
- What is its value now, and when was that value last updated?
- How did my asset value and net worth change over a selected period?
- How much is daily-use cash versus protected savings or investments?

## 2. Product principles

1. **Wealth is not a spending allowance.** Total assets and net worth must never be added to Safe to Spend Today.
2. **Keep cash purposes visible.** Distinguish daily-use cash from protected savings/emergency funds, investments, gold, and foreign currency. The user's established example is BCA/BRI for daily cash and SeaBank/Bibit/FX/gold as separate pools; these are examples, not preloaded balances.
3. **Every value has provenance.** Show whether a value comes from a transaction-derived balance or a manual valuation, and its as-of date.
4. **Transfers do not create or destroy wealth.** A transfer between tracked asset accounts moves value without counting as income or expense.
5. **Budget and asset records reconcile without duplication.** A budget expense paid from a tracked cash account reduces that account once and remains one expense.
6. **Offline first and user controlled.** Data is stored locally in IndexedDB. Users enter or update balances themselves in the MVP.

## 3. Goals and success measures

### Goals

- Let users create, update, archive, and inspect assets by type and holding place.
- Show total assets, daily-use cash, protected savings, investment value, and net worth (when liabilities are recorded).
- Preserve a dated value history and show month-over-month changes.
- Link cash movements to budget transactions and transfers where useful.
- Make stale and approximate values clear instead of implying live pricing.

### Success measures

- A user can record an opening balance and see it reflected in the total assets.
- A user can update a market-valued asset and see both the new total and the change since the previous valuation.
- A transfer between two tracked assets leaves total assets unchanged.
- A linked expense reduces the selected cash account and appears once in budget spending.
- Asset and net-worth figures do not alter Safe to Spend Today.

## 4. Users and core jobs

- **Budget-focused user:** wants to keep daily spending accounts distinct from savings and investments.
- **Savings-focused user:** wants visibility across bank accounts, e-wallets, deposits, and purpose-based funds.
- **Investor / multi-asset user:** wants to manually track mutual funds, stocks, gold, and foreign currency without needing brokerage integrations.

Core job: “When I review my finances, show me what I own, where it is, how its value has changed, and which portion is available for everyday use—without mixing my net worth into my spending limit.”

## 5. Scope

### MVP — Must have

- Asset list grouped by asset class and/or holding place.
- Create, edit, and archive an asset; archived assets remain in historical reports.
- Supported asset types:
  - Cash, bank account, e-wallet, and deposit.
  - Mutual fund / investment fund.
  - Stock / ETF.
  - Gold / precious metal.
  - Foreign currency.
  - Other manually valued asset.
- Asset attributes: display name, asset type, institution/place, optional notes, currency, balance/valuation method, and optional purpose tag (`DAILY_CASH`, `PROTECTED_SAVINGS`, `INVESTMENT`, `OTHER`).
- Opening balance and dated asset activity.
- Dated manual valuation updates for market-valued assets, with optional quantity and unit price.
- Current total asset value in IDR and value by class/place/purpose.
- Historical value chart and a selected-period comparison (month, quarter, year, custom dates).
- Show absolute change and percentage change with the comparison dates visible. Show contributions/withdrawals separately; do not label simple net change as investment return.
- Manual FX asset entry with native currency amount and user-entered IDR conversion rate; store the rate and valuation date used.
- Transfer between tracked accounts with paired records and a shared transfer ID.
- Optional “Paid from” account link on a budget transaction. One action must update budget spending and the selected cash balance once.
- Basic liability balances for credit card/paylater, installment, loan, or other liability so the wealth view can calculate net worth.
- Responsive, mobile-first Assets screen and detail screen using the existing Astryx UI direction.
- Offline-first IndexedDB persistence behind repository interfaces.

### Later / out of scope for MVP

- Live bank, brokerage, stock, mutual fund, commodity, or FX integrations.
- Automatic market-price refresh, buy/sell order management, tax-lot accounting, and realized/unrealized tax reports.
- Financial advice, recommended asset allocation, or trading signals.
- Shared household access, cloud sync, multi-user permissions, and account aggregation.
- Historical backfill from statements or automatic import from CSV/PDF.
- Full debt payoff planning and interest schedules.

## 6. Information architecture and key screens

### Navigation

Add **Assets** as a primary destination. On mobile, include it in the bottom navigation; on larger layouts, include it in the sidebar. Keep Overview as the place where Safe to Spend Today remains the primary figure.

### Overview integration

- Keep the Safe to Spend Today card and Budget Health focused on the active budget period.
- Add a compact “Your assets” summary with total assets, daily-use cash, protected savings/investments, and a link to Assets.
- Optionally show net worth when liability data exists.
- Label asset figures as financial-position information. Do not use asset totals to increase Safe to Spend Today.

### Assets overview

- Total assets in IDR, net worth if liabilities exist, and month-over-month change.
- Value-over-time chart with range selector.
- Breakdown by account/place, asset class, and purpose tag.
- Daily-use cash separated from protected savings and investments.
- List rows show name, type/place, current IDR value, native balance when applicable, as-of date, and stale-value status.
- Primary actions: `Add asset`, `Update value`, and `Record transfer`.

### Asset detail

- Current value, native units/currency if applicable, and last-updated date.
- Value history chart and dated activity/valuation timeline.
- Actions: edit details, add activity, update valuation, transfer (when applicable), archive.

### Liability overview/detail

- Outstanding balance grouped by type/place.
- Dated balance adjustments and settlement records.
- Show total liabilities and calculated net worth; hide net worth if no liability/asset data is available rather than implying zero.

## 7. Functional requirements

### FR-1: Create and manage assets

Users can create an asset by entering a name, supported type, holding place, purpose, and opening value. Optional notes and identifiers (for example, ticker or gold purity) may be recorded. Users can edit metadata and archive an asset. Deleting an asset with activity is disallowed in favor of archive to preserve history.

### FR-2: Track cash-like balances

Cash, bank, e-wallet, and deposit balances are derived from an opening balance plus dated credits and debits. Editing or deleting an activity recalculates the balance and history. Users may add a correction entry with a reason instead of silently overwriting prior activity.

### FR-3: Track market-valued assets

For funds, stocks, gold, FX, and other manually valued assets, users can save a dated value snapshot. Quantity and unit price are optional. The current value is the latest valid snapshot as of today; future-dated snapshots must not appear as current. An old value remains visible but is marked stale.

### FR-4: Track transfers

A transfer creates a debit from one tracked asset and an equal credit to another, joined by a shared transfer ID. Transfers do not count as income, expense, investment gain, or loss. The system must prevent a one-sided transfer from being saved.

### FR-5: Link a budget expense to its payment account

When a user records a budget expense, they may select `Paid from` a cash-like asset. Saving creates one budget transaction and one linked account debit atomically. Editing/deleting the linked budget transaction updates/removes the corresponding debit, without creating a duplicate expense. If no account is selected, budget behavior remains unchanged.

### FR-6: Track liabilities and calculate net worth

Users can record a liability balance and dated changes. Net worth is `total assets − total liabilities`. A credit-card bill payment linked to a previously recorded expense is a settlement: it reduces cash and the liability, and is not counted as a second expense. Interest/fees are expenses if recorded as such.

### FR-7: Show changes over time

Users can select a date range and compare asset value at the start and end. Show start value, end value, absolute change, percentage change when the start value is greater than zero, and net contributions/withdrawals during the range. Transfers between tracked assets are excluded from contributions/withdrawals. For MVP, change is descriptive and not a time-weighted investment performance calculation.

### FR-8: Offline persistence and recovery

Asset records, activity, valuations, and preferences are stored locally in IndexedDB. The UI shows saved/offline status. Repository contracts keep domain calculations independent of Dexie and allow a later sync/backend implementation.

## 8. Data model proposal

- **AssetAccount**
  - `id`, `name`, `type`, `institution`, `purpose`, `nativeCurrency`, `balanceMode` (`LEDGER` | `VALUATION`), `notes`, `createdAt`, `archivedAt?`.
- **AssetEntry** — cash-like activity and transfers
  - `id`, `assetId`, `date` (`DateOnly`), `kind` (`OPENING_BALANCE` | `CREDIT` | `DEBIT` | `TRANSFER_IN` | `TRANSFER_OUT` | `CORRECTION`), integer native minor-unit amount, `transferId?`, `budgetTransactionId?`, `note?`.
- **AssetValuation** — dated market/manual value snapshot
  - `id`, `assetId`, `asOfDate` (`DateOnly`), `nativeAmountMinor`, `nativeCurrency`, optional `quantity` and `unitPrice`, saved IDR conversion rate, integer `valueIdr`, `source` (`MANUAL` | `IMPORTED`), `note?`.
- **LiabilityAccount**
  - `id`, `name`, `type`, `institution`, `nativeCurrency`, `createdAt`, `archivedAt?`.
- **LiabilityEntry**
  - `id`, `liabilityId`, `date` (`DateOnly`), `kind` (`OPENING_BALANCE` | `CHARGE` | `PAYMENT` | `INTEREST_OR_FEE` | `CORRECTION`), integer native minor-unit amount, optional linked asset-entry/budget-transaction IDs.
- **AssetSnapshot** (derived or materialized)
  - `asOfDate`, IDR total by asset class/purpose, liability total, net worth. Snapshot creation must be idempotent by date and must not double-apply ledger entries.

Domain amounts remain integer IDR for budget calculations. Asset records may store native-currency integer minor units and an explicit conversion rate; conversions to IDR are rounded to the nearest whole rupiah and retain the rate/date for reproducibility. Decimal quantities and unit prices must use a precise representation (decimal string or fixed-point integers), never binary floating-point for persisted financial calculations.

## 9. Calculation and accounting rules

- Ledger-mode asset balance = opening balance + credits + transfer-ins − debits − transfer-outs, adjusted by corrections.
- Valuation-mode asset value = latest valuation snapshot on or before the as-of date.
- Total assets = sum of current IDR values for active assets.
- Total liabilities = sum of current outstanding liability balances converted to IDR.
- Net worth = total assets − total liabilities.
- Period asset change = ending total assets − beginning total assets. Show cash flows alongside it; do not misrepresent contribution-driven growth as investment return.
- Internal transfer total impact on assets is zero when both sides are tracked. A transfer to an untracked account is a withdrawal from tracked assets; a transfer from an untracked account is a contribution.
- Flazz/e-wallet top-ups between tracked accounts are transfers/stored balance movements, not expenses.
- A credit-card/paylater payment is liability settlement, not a new expense when the underlying purchase was already recorded.
- Asset totals, protected savings, and net worth are never inputs to budget Safe to Spend. Safe to Spend remains derived from the active budget period, its transactions, commitments, and reserve.

## 10. UX and validation

- Monetary values display in IDR with separators; calculations use integer rupiah.
- Date entry and display use date-only values, not UTC timestamps.
- Require asset name, asset type, currency, and a non-negative opening value. Reject malformed dates, unsupported currency codes, and unsafe/non-integer minor-unit values.
- Require both source and destination for transfers; source and destination must differ; transfer amounts must be positive and cannot exceed source balance unless the user explicitly records an overdraft as a separate liability.
- For valuation updates, require an as-of date and value. Warn before saving an as-of date older than the latest existing valuation; preserve history rather than silently replacing it.
- Display stale price/value labels and “manual estimate” where applicable.
- Confirm archive when there are linked records; never remove those records.
- Use accessible labels, keyboard-operable dialogs/forms, visible field-linked errors, descriptive text alternatives for charts, high-contrast focus indicators, and mobile touch targets of at least 44px.
- Keep budget expense entry on one screen; commitment and Paid from links remain optional and must not block a valid expense.
- Use subtle dialog open/close motion and respect `prefers-reduced-motion`.

## 11. Non-functional requirements

- The asset overview should render smoothly with at least 500 assets and 20,000 ledger/valuation entries on a current mobile browser; use indexed queries and derived summaries as needed.
- IndexedDB writes that span a budget transaction and linked asset entry must be atomic.
- Date handling must remain correct across time zones and daylight-saving transitions by treating values as date-only.
- Currency conversion must be reproducible from stored native amount, rate, rate date, and rounding rule.
- Include unit tests for balance derivation, transfers, linked expense changes, liabilities/net worth, stale valuations, historical range comparisons, and offline reload.
- Include Playwright coverage for creating an asset, updating a valuation, recording a transfer, linking an expense to a cash account, and confirming assets do not change Safe to Spend.

## 12. Acceptance criteria

1. A user can create a bank/cash asset with an opening balance and see it in total assets and its purpose group.
2. A user can record dated credits/debits and the current balance and history update correctly after reload.
3. A user can create a stock, fund, gold, or FX asset and add at least two dated valuations; the detail view shows the chronological change.
4. A manual FX value records its native amount, conversion rate, rate date, and IDR value so the displayed conversion can be explained later.
5. A tracked-account transfer produces paired entries and does not alter total assets.
6. A budget expense linked to a cash account affects budget spending once and the asset balance once; edit/delete keeps both aggregates consistent.
7. A liability payment reduces the cash asset and liability without adding a second expense.
8. Net worth equals total assets minus liabilities and never changes Safe to Spend Today.
9. Changing the selected time range updates the starting value, ending value, net change, and flow summary with explicit dates.
10. Users can use the Assets section and all key actions on a narrow mobile viewport without horizontal page scrolling.
11. All data entry and review continues to work offline after the first app load.

## 13. Delivery plan

### Asset Tracker Sprint A — Domain and storage

- Add asset/liability models, repository interfaces, Dexie schema migrations, and integer/date-only helpers.
- Implement ledger balance, valuation history, transfer atomicity, liability/net-worth calculations, and budget transaction linking.
- Add focused unit tests before screens.

### Asset Tracker Sprint B — Mobile-first UI

- Add Assets primary navigation, overview cards, class/purpose breakdown, asset list, and detail view.
- Add create/edit/archive flows and cash activity / valuation forms using RHF + Zod and Astryx.
- Provide empty states and stale/manual valuation indicators.

### Asset Tracker Sprint C — Budget integration and history

- Link `Paid from` asset to transaction create/edit/delete flows.
- Add transfer flow, date-range history chart, cash flow summaries, and optional liability views.
- Verify linked updates atomically and protect Safe to Spend invariants.

### Asset Tracker Sprint D — Quality and release readiness

- Complete Playwright critical flows, mobile viewport/accessibility checks, offline reload checks, and migration tests.
- Document manual valuation limitations and the no-live-pricing scope in the UI.

## 14. Open product decisions

1. Default asset-history range: current month or last 12 months? **Proposed:** current month, with a 12-month chart accessible by range selection.
2. Where should users enter liabilities? **Proposed:** Assets overview has a Net Worth summary and a secondary Liabilities section.
3. Should a selected daily-cash asset be required for budget expenses? **Proposed:** optional, to preserve quick entry and support cash expenses from untracked wallets.
4. How should FX conversion be refreshed? **Proposed MVP:** user-entered rate per valuation; no network lookup or automatic price refresh.
5. Which assets should appear as sample data? **Proposed:** use illustrative demo records only; never seed personal balances or account values.
