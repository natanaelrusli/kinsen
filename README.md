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

On desktop, use the sidebar chevron to collapse navigation to an icon rail. Hover or keyboard-focus an icon to reveal its label. On phones, open navigation with the **Open navigation** button. The top bar shows the current page, compact sync status, search, appearance, and account controls; page navigation stays in the sidebar. Open command search from the top bar or with `⌘K`/`Ctrl+K`; dismiss it with Escape or the **Close search** button.

UI icons use `lucide-react`, including the theme-scoped Astryx control glyphs. The active sidebar destination keeps its selection styling and gains a stronger hover background in light and dark modes, both expanded and collapsed. The Kinsen brand mark and asset data charts are unchanged.

This app is single-owner; other Clerk accounts receive `403`. To intentionally transfer API ownership, first back up the SQLite database, then run `pnpm --filter @kinsen/api db:transfer-owner -- --to-user-id <clerk-user-id>` using the target account's Clerk user ID. This changes only the `app_owner` binding; it preserves budget tables and revokes API access for the previous account. Browser-local IndexedDB ownership is separate. Multi-user budgets require a separate tenant-isolation design.

**Settings** is in the app navigation. Choose **Light**, **Dark**, or **System** in Settings or the top-bar **Appearance** menu. System follows device appearance changes automatically; an explicit choice overrides the device setting. Appearance preferences apply immediately and are saved on this device, not synced to other devices:

- **Accent color:** Evergreen, Ocean, Lilac, Terracotta, Marigold, Rose, Slate, or Indigo. Navigation highlights follow the selected accent too.
- **Surface palette:** Warm ivory, cool blue gray, or neutral gray backgrounds and panels, independently of the accent. Each supports light and dark mode.
- **Corners:** Rounded or crisp corners for workspace panels and Astryx controls.
- **Heading style:** Editorial serif or modern sans-serif headings throughout the workspace.
- **Layout and behavior:** Compact spacing, motion effects, and calendar week start remain available.

Color preferences also apply to forms, command search, and Clerk account/sign-in surfaces. Existing saved preferences retain their values; newly added controls default to warm surfaces, rounded corners, and editorial headings. These controls do not alter budget or asset data. Account data controls are linked from the Settings page.

**Dashboard sections** in Settings controls the Overview page (`/`). Use **Customize dashboard** on the Overview to reach these controls, then toggle Budget summary, Your assets, Category pulse, Still to pay, or Recent activity. Changes apply immediately and are saved on this device across reloads; all sections start visible. Safe to Spend and budget health always remain visible. A single visible category/commitments panel fills its row. Hiding a section only changes the dashboard view, not budget calculations or saved data; the dedicated pages remain available.

**Account settings** is available from the Settings page. **Reset all account data** deletes the server budget and the current browser's budget, pending-sync, asset, and liability data while keeping the Clerk sign-in active. Other devices clear their local copies on their next sync; the reset requires the API to be reachable. **Deactivate account** bans the Clerk user from signing in, but retains Kinsen data. Only an administrator can reactivate that Clerk account; reset data separately if it must be erased.

## Asset tracking

Assets, valuations, transfers, and liabilities are stored in the current browser's IndexedDB. They are not synced to the API or other devices; resetting account data clears them from this browser too. A budget expense's optional `Paid from` link is local, while the budget transaction remains one ordinary budget transaction.

Cash-like accounts and liabilities are recorded in IDR. Market-valued assets use dated manual estimates; foreign-currency valuations store the entered conversion rate and rate date. Kinsen does not fetch live asset prices or exchange rates. Old estimates remain in history and are marked stale. Asset totals and net worth never increase Safe to Spend.

## API

Budget entry-deletion routes return `204 No Content`. `DELETE /api/account/data` returns `{ dataGeneration }`; budget mutations require the current `x-kinsen-data-generation` from `GET /api/budget`, and stale requests receive `409`.

- `GET /api/health` — API and database readiness.
- `GET /api/budget` — returns `{ snapshot, dataGeneration }`.
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
