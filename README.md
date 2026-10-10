# Kinsen

Kinsen is an offline-first daily budget planner. The workspace contains a React web app, an Express API, and a shared TypeScript budget domain.

## Workspace

- `apps/web` — React, Vite, Dexie/IndexedDB, and the PWA frontend.
- `apps/api` — Express 5 TypeScript API and SQLite persistence using Node's built-in `node:sqlite`.
- `packages/budget-domain` — shared budget types, validation, date-only helpers, and calculations.

## Requirements and commands

- Node.js 22.13 or newer.
- pnpm 11.24.0 (declared in `package.json`).

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the API on `127.0.0.1:3001` and the Vite frontend on `127.0.0.1:5173`. Vite proxies `/api` to the API. The API creates its SQLite database on first startup.

To access both the frontend and API from another device on a trusted network, configure Clerk as described below, then run:

```sh
pnpm dev:network
```

Open `http://<this-machine's-LAN-IP>:3001` on the other device. The frontend serves `/api/*` on the same address and proxies it to the API on `127.0.0.1:3002`; for example, `http://<this-machine's-LAN-IP>:3001/api/health` checks backend readiness. Only frontend port `3001` needs to be reachable through the host firewall. `pnpm dev` retains its local-only ports (`5173` frontend, `3001` API). Do not expose Vite's development server to the public internet.

```sh
pnpm test       # domain, web and API behavior tests
pnpm build      # all workspace packages
pnpm test:e2e   # Clerk controls, budget guard, asset accounting and offline UI flows
pnpm db:migrate # apply SQLite migrations without starting the API
```

`pnpm start` starts only the API. For a local production preview, build first, then run `pnpm start` and `pnpm --filter @kinsen/web preview` in separate terminals; the preview listens on `127.0.0.1:4173`. Set `WEB_HOST=0.0.0.0` on the preview command to make that preview reachable on a trusted network too. A deployed frontend must route same-origin `/api` requests to the API; use an HTTPS reverse proxy for public deployment, not Vite's development or preview server.

## Configuration

- `HOST` — API bind address; defaults to `127.0.0.1`.
- `PORT` — API port; defaults to `3001` (`pnpm dev:network` sets it to `3002`).
- `DATABASE_PATH` — SQLite file path; defaults to `data/kinsen.sqlite` relative to the API process working directory. Workspace scripts run the API from `apps/api`, so the default file is `apps/api/data/kinsen.sqlite`. Use `:memory:` for disposable test runs.
- `KINSEN_API_TARGET` — Vite dev/preview proxy target; defaults to `http://127.0.0.1:3001`.
- `WEB_HOST` — Vite dev/preview bind address; defaults to `127.0.0.1`. `pnpm dev:network` sets it to `0.0.0.0` without changing the API bind address.
- `WEB_PORT` — Vite dev port; defaults to `5173` (`pnpm dev:network` sets it to `3001`).

SQLite migrations run automatically when the API opens the database. `pnpm db:migrate` applies them explicitly. Stop the API and back up the database file before replacing or restoring it.

## Clerk authentication

The frontend uses `@clerk/react`; the API validates session tokens with `@clerk/express`. This React/Vite workspace is linked to Clerk application `app_3KIii8HfJsup41N5rwZcbEs9lJw`.

Pull development keys into the ignored repository-root `.env.local` file:

```sh
clerk auth login
clerk link --app app_3KIii8HfJsup41N5rwZcbEs9lJw
clerk env pull --app app_3KIii8HfJsup41N5rwZcbEs9lJw --file .env.local
```

Check the linked app and local key names without displaying key values:

```sh
clerk doctor
```

`clerk init` cannot detect this multi-package Vite/Express workspace, so the Clerk SDKs are configured directly with the official React and Express integrations.

`pnpm dev` loads the root file in the API and Vite. The API requires `CLERK_SECRET_KEY` and a Clerk publishable key. Vite exposes only `VITE_*` variables and `CLERK_PUBLISHABLE_KEY`; never add the secret key with a `VITE_` prefix or commit `.env.local`.

To initialize access, open the frontend URL printed by `pnpm dev` and choose **Create your account**. The first authenticated Clerk account claims the existing SQLite budget and the current browser's local IndexedDB data.

For access from a different hostname or device, configure that origin in your Clerk application. Production access requires a Clerk production instance, its matching publishable/secret keys, an approved domain, and HTTPS; browser offline/PWA features also require a secure context (localhost is exempt). A browser on another device has its own IndexedDB data; asset tracking remains device-local.

On desktop (1024px and wider), use the sidebar chevron to collapse navigation to an icon rail. Hover or keyboard-focus an icon to reveal its label. Narrower screens use a persistent bottom bar with **Overview**, **Calendar**, **Activity**, **Assets**, and **More**. More reveals **Commitments**, **Budget settings**, **Settings**, **Account settings**, and **PLN Token Tracker**; it closes after navigation, an outside tap, Escape, or switching to desktop width. Asset detail pages keep Assets selected, and secondary pages highlight More. The bottom bar occupies a separate layout row, so it never overlays the scrolling content, and accounts for device safe areas. The top bar retains search, appearance, account controls, and accessible sync status. Open command search from the top bar or with `⌘K`/`Ctrl+K`; dismiss it with Escape or the **Close search** button.

UI icons use `lucide-react`, including the theme-scoped Astryx control glyphs. The active sidebar destination keeps its selection styling and gains a stronger hover background in light and dark modes, both expanded and collapsed. The Kinsen brand mark and asset data charts are unchanged.

Mobile layouts use larger input text, touch-friendly transaction actions and dialog close controls, wrapping transaction descriptions, and stacked budget save controls. The Settings category menu adapts to enlarged text without truncating its labels. Navigation uses labeled icons, current-page indicators, keyboard focus states, and main-content focus after route changes. Existing light/dark preferences and reduced-motion support apply to these controls.

This app is single-owner; other Clerk accounts receive `403`. To intentionally transfer API ownership, first back up the SQLite database, then run `pnpm --filter @kinsen/api db:transfer-owner -- --to-user-id <clerk-user-id>` using the target account's Clerk user ID. This changes only the `app_owner` binding; it preserves budget tables and revokes API access for the previous account. Browser-local IndexedDB ownership is separate. Multi-user budgets require a separate tenant-isolation design.

**Settings** is in the app navigation, with a dedicated category submenu: **Appearance**, **Layout & motion**, **Calendar**, **Dashboard**, and **Bank email import**. Desktop shows the submenu beside the active panel; narrow screens use a two-column category menu above it. Categories support direct links such as `/settings?section=calendar` and `/settings?section=dashboard`, with browser back/forward navigation. Account & data stays separate from workspace preferences. Choose **Light**, **Dark**, or **System** in Appearance or the top-bar **Appearance** menu. System follows device appearance changes automatically; an explicit choice overrides the device setting. Workspace preferences apply immediately and are saved on this device, not synced to other devices:

- **Accent color:** Evergreen, Ocean, Lilac, Terracotta, Marigold, Rose, Slate, or Indigo. Navigation highlights follow the selected accent too.
- **Surface palette:** Warm ivory, cool blue gray, or neutral gray backgrounds and panels, independently of the accent. Each supports light and dark mode.
- **Corners:** Rounded or crisp corners for workspace panels and Astryx controls.
- **Heading style:** Editorial serif or modern sans-serif headings throughout the workspace.
- **Layout & motion:** Compact spacing and motion effects, respecting the device’s reduced-motion preference.
- **Calendar:** Sunday or Monday week start. Review actual spending and unpaid commitments by date, select a day for its details, or add an expense there.

Color preferences also apply to forms, command search, and Clerk account/sign-in surfaces. Existing saved preferences retain their values; newly added controls default to warm surfaces, rounded corners, and editorial headings. These controls do not alter budget or asset data. Account data controls are linked from the Settings page.

**Dashboard** in the Settings submenu controls the Overview page (`/`). **Customize dashboard** on the Overview opens this category directly. Toggle Budget summary, Your assets, Category pulse, Still to pay, or Recent activity. Changes apply immediately and are saved on this device across reloads; all sections start visible. Safe to Spend and budget health always remain visible. A single visible category/commitments panel fills its row. Hiding a section only changes the dashboard view, not budget calculations or saved data; the dedicated pages remain available.

**Bank email import** (`/settings?section=bank-email`) configures BCA only. Enter the receiving Gmail mailbox, the exact sender address from a genuine BCA transaction email, and a default budget category (or **Review each expense**). **Save BCA configuration** validates and stores these values in this browser; **Clear configuration** removes them. Deleted categories must be replaced before saving. Currency is IDR and the transaction timezone is Asia/Jakarta (WIB). This is configuration only: Gmail OAuth, sender authentication, server events, and automatic expense imports are not connected. No email is read and no transaction is created. Do not enter banking credentials or one-time codes. These preferences are not synced to the API or cleared by budget reset; use **Clear configuration** to remove them.

**Account settings** is available from the Settings page. **Reset all account data** deletes the server budget and the current browser's budget, pending-sync, asset, liability, and PLN Token Tracker readings while keeping the Clerk sign-in active. Other devices clear their local copies on their next sync; the reset requires the API to be reachable. **Deactivate account** bans the Clerk user from signing in, but retains Kinsen data. Only an administrator can reactivate that Clerk account; reset data separately if it must be erased.

Deleting a transaction, commitment, asset or liability activity record, or an unused category requires in-app confirmation; transactions can be restored for 10 seconds after deletion. Asset and liability archives also require confirmation.

## Asset tracking

Assets, valuations, transfers, and liabilities are stored in the current browser's IndexedDB. They are not synced to the API or other devices; resetting account data clears them from this browser too. A budget expense's optional `Paid from` link is local, while the budget transaction remains one ordinary budget transaction.

Cash-like accounts and liabilities are recorded in IDR. Market-valued assets default to dated manual estimates; foreign-currency valuations retain the entered conversion rate and rate date. IDR gold assets can explicitly opt into **Automatic gold price**: select a source, an exact product/package weight, and units held. Units count packages, not grams; two 5g packages use twice the provider's 5g package price. Existing gold holdings remain manual until configured.

Gold prices use the provider's IDR retail `sellPrice` from [logam-mulia-api](https://github.com/iamutaki/logam-mulia-api), an indicative replacement estimate—not a buyback value. Prices refresh on entry/resume, hourly while visible, on reconnection, or via **Refresh gold prices**. Upstream quotes are cached daily, not live ticks. Each changed quote or holding saves an immutable local snapshot with source, product, package units/price, provider date and observation date; unchanged quotes do not add duplicate history. Source failures, missing products, older quotes and offline operation retain the last saved value. Quotes older than one day are marked stale; manual estimates retain their 30-day stale rule.

Automatic pricing requires IDR; Kinsen does not migrate existing foreign-currency gold holdings or fetch FX rates. Edit details to change package units/product or disable automation; prior valuations remain in history, and unchanged metadata edits/disable work offline. Clearing account data cancels pending price requests. Asset totals and net worth never increase Safe to Spend.

The assets UI lives in `apps/web/src/features/assets/`. `AssetsPage.tsx` coordinates initialization, gold refresh, and asset/valuation/transfer dialogs. `AssetHistorySection` owns date-range controls and history calculations; `AssetHoldingsSection` owns grouped holdings and asset rows; `AssetLiabilitiesSection` owns liability actions, forms, confirmations, and paginated history. `AssetPositionSummary`, `AssetBreakdowns`, and `ArchivedAccountsSection` render the remaining sections. Keep section-specific state and derived data with the section that uses them; shared financial rules remain in `@kinsen/budget-domain`.

## PLN Token Tracker

Open `/electricity` from the desktop sidebar, mobile **More**, or command search. Record manual readings for one prepaid meter; each reading's balance is the post-refill balance when a top-up is attached. The tracker is not a live meter feed and does not look up PLN tariffs.

Usage follows balance conservation: opening balance plus credited top-ups after the opening reading, minus the latest balance. Unknown refill credit blocks affected usage and depletion estimates. An explicitly inferred refill remains provisional because a balance increase cannot reveal electricity consumed between readings. Monthly values cover the selected month’s observed dates; partial periods are not presented as full-calendar-month consumption.

The depletion estimate starts from the last measured balance and reading date, applies the lifetime average daily usage, assumes unchanged use and no future top-ups, and rounds down to an approximate calendar day. The reading age is shown separately; a past estimate asks for a new reading and does not assert that the meter is empty. **Recorded refill spending** is cash outflow, not a tariff or consumed-energy cost, and never creates a budget expense.

Readings are saved in this browser’s IndexedDB, work offline, and are not synced to the API or other devices. **Reset all account data** also clears these readings from the current browser.

## API

Budget entry-deletion routes return `204 No Content`. `DELETE /api/account/data` returns `{ dataGeneration }`; budget mutations require the current `x-kinsen-data-generation` from `GET /api/budget`, and stale requests receive `409`.

- `GET /api/health` — API and database readiness.
- `GET /api/budget` — returns `{ snapshot, dataGeneration }`.
- `GET /api/gold-prices?source=logammulia` — authenticated owner-only normalized gold catalog (`source`, `quotes`, `fetchedAt`), with no budget generation header or budget mutation. Sources are allowlisted; unsupported queries return `400`, unusable upstream responses `502 GOLD_PRICE_UNAVAILABLE`, and the eight-second timeout `504 GOLD_PRICE_TIMEOUT`. Responses are `no-store`; no upstream credentials or provider fallback are used.
- `DELETE /api/account/data` — clears the authenticated owner's budget and increments its data generation.
- `POST /api/account/deactivate` — bans the authenticated owner in Clerk; Kinsen data is retained.
- `POST /api/budget/import` — imports a browser snapshot only when the API has no budget; repeating the same import is idempotent. A different existing API snapshot returns `409`.
- `PUT /api/budget` — saves `{ period, categories }`.
- `PUT /api/planned-expenses/:id` and `DELETE /api/planned-expenses/:id` — save or remove a planned expense. The URL ID must match the body ID on `PUT`.
- `PUT /api/transactions/:id` and `DELETE /api/transactions/:id` — save or remove a transaction. The URL ID must match the body ID on `PUT`.

Budget mutation requests include the generation returned by `GET /api/budget`. A reset increments it, so older clients cannot write stale data back.

Only `GET /api/health` is public. All other routes require a valid Clerk session; only the first account can access the budget.

Requests are validated with Zod and the shared domain invariants. Amounts are integer IDR; dates use `YYYY-MM-DD` date-only values.

## Local storage and synchronization

The browser keeps its existing `kinsen-budget` IndexedDB database and upgrades its schema to add a transactional operation outbox. Local writes continue to work offline; queued operations replay when the API becomes reachable.

On startup, an existing browser snapshot imports into an empty API. If the API has data and the browser database is empty, the browser hydrates from the API. If both sides already contain different snapshots, Kinsen preserves both copies and displays a sync conflict rather than overwriting either side. Reconcile the copies manually before clearing or replacing either store.

Each reset generation invalidates older browser copies. On their next synchronization, other devices clear the IndexedDB budget and queued operations instead of re-importing them.

The API binds to loopback by default, including with `pnpm dev:network`; remote clients reach it only through the frontend's `/api` proxy. Keep `HOST` at `127.0.0.1` unless an authenticated API deployment behind an HTTPS reverse proxy requires a different bind address. Do not expose the API or Vite directly to the public internet.
