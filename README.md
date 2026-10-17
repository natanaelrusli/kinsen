# Kinsen

Kinsen is an offline-first daily budget planner. The workspace contains a React web app, an Express API, a shared TypeScript budget domain, and a browser-paired MCP server for AI agents.

## Workspace

- `apps/web` — React, Vite, Dexie/IndexedDB, and the PWA frontend.
- `apps/api` — Express 5 TypeScript API and SQLite persistence using Node's built-in `node:sqlite`.
- `apps/mcp` — Model Context Protocol server (stdio, or Streamable HTTP for remote agents) with a token-paired, loopback-only WebSocket bridge to the open app.
- `packages/budget-domain` — shared budget types, validation, date-only helpers, and calculations.
- `packages/mcp-contract` — shared MCP tool schemas and browser bridge protocol.

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

## MCP: manage app data with an AI agent

The MCP server exposes 23 tools for budget periods/categories, transactions, commitments, assets, valuations, transfers, liabilities/payments, gold prices, and PLN electricity readings. It uses the **open, signed-in browser** as the data gateway, so browser-only records remain on that device. Existing app validation, atomic financial operations, UI store refreshes, and the budget synchronization outbox still apply. The server never opens SQLite directly or receives your Clerk credentials. Appearance, bank-email configuration, account reset, and account deactivation are not exposed as MCP tools.

### Setup

1. Run `pnpm install` and `pnpm build`.
2. Run `pnpm dev`, open **http://127.0.0.1:5173**, and sign in.
3. Generate a separate bridge secret:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Add the following to your MCP client's server configuration. Replace the absolute repository path and `PASTE_THE_SECRET_GENERATED_ABOVE`; the client launches the server itself:

   ```json
   {
     "mcpServers": {
       "kinsen": {
         "command": "node",
         "args": ["/absolute/path/to/kinsen/apps/mcp/dist/index.js"],
         "env": {
           "KINSEN_BRIDGE_TOKEN": "PASTE_THE_SECRET_GENERATED_ABOVE",
           "KINSEN_BRIDGE_PORT": "3003",
           "KINSEN_APP_ORIGIN": "http://127.0.0.1:5173"
         }
       }
     }
   }
   ```

5. In Kinsen, open **Settings → Account settings → AI agent connection**. Enter the same bridge secret and port, then choose **Connect AI agent**. Keep the app open while the agent works. Pairing persists as you navigate within the app, but not after reload.

Use an absolute Node executable path in `command` if your MCP client does not inherit your shell's PATH. For a terminal launch, set the same environment variables and use `pnpm --silent mcp`; stdout is reserved for the MCP protocol, and startup diagnostics go to stderr. Do not launch a second instance on the same port.

### Access and operation rules

- Pair only an agent you trust: the connection grants read/write access to financial records, including deletion. It does not require an in-app prompt for each mutation; use your MCP client's tool-approval controls.
- The secret is required, at least 32 characters, and is not saved by Kinsen's browser UI. Keep the client configuration private; never commit the secret or use a Clerk token. Rotate it by changing the client configuration, restarting its server, and pairing again.
- The bridge listens only on `127.0.0.1`. Browser and MCP server must run on the same machine. Use the local HTTP development app; an HTTPS deployment can block the insecure `ws://` connection. The bridge is never a public endpoint; remote agents use the HTTP endpoint below, which still needs the signed-in browser on the same machine as the MCP server.
- `KINSEN_APP_ORIGIN` is one exact HTTP(S) origin with no trailing slash/path. `localhost` and `127.0.0.1` are different origins. For preview use `http://127.0.0.1:4173`; for another local port change the configured origin accordingly. Origin and Host are checked before pairing; only one browser can pair with a server.
- **Disconnect AI agent**, sign-out, closing/reloading the app, or clearing account data revokes the session. Queued commands cannot start after revocation. An operation already in progress may finish; disconnect does not roll it back.
- Unpaired calls fail rather than waiting. Calls have a 30-second deadline, and bridge messages have a 1 MiB limit. A timeout/disconnect can leave a mutation's outcome unknown: read the current data before proceeding, and **do not retry blindly**. There is no automatic reconnection or replay.
- Start with `kinsen_get_data` (`scope`: `all`, `budget`, `assets`, or `electricity`). Read current IDs before edits. For new records generate unique stable IDs; update tools retain those IDs. `kinsen_save_budget` takes the full category list, not a partial patch. Budget mutations report `savedLocally` and `syncStatus`; local success does not claim that the API has already synced. Assets, liabilities, and readings remain device-local.
- Amounts are whole IDR for budgets and IDR ledgers; valuations use native currency minor units with an explicit conversion rate. Electricity balances/credits use **milli-kWh** (`1000 = 1 kWh`). Dates are calendar dates in `YYYY-MM-DD`.
- Deletion/archive tools require `confirm: true` after user authorization. Transfers and liability payments create both linked entries atomically and do not create budget expenses. Linked/opening records cannot be overwritten as standalone activity. Manual valuations append immutable history; automatic gold prices come from real provider responses, not supplied provenance.

### Remote agents over HTTP

The default transport is stdio, where the agent launches the server itself. To let an agent on another device reach it, run the server in Streamable HTTP mode. Remote here means the agent can reach the machine that runs the server and the signed-in browser. Browser pairing stays loopback-only.

1. Generate a secret for MCP clients, separate from the bridge secret:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Start the server in HTTP mode. The defaults bind `127.0.0.1:3004`, and the endpoint is `http://127.0.0.1:3004/mcp`:

   ```sh
   KINSEN_MCP_TRANSPORT=http KINSEN_MCP_TOKEN=PASTE_MCP_SECRET KINSEN_BRIDGE_TOKEN=PASTE_BRIDGE_SECRET pnpm --silent mcp
   ```

3. Every request must send `Authorization: Bearer <KINSEN_MCP_TOKEN>`. Requests without it, or with a wrong or short token, get `401` with a `WWW-Authenticate` challenge. Repeated failures from one address lock that address out for a minute (`429`), including correct tokens.

Example client configurations, for a local endpoint or an HTTPS one (replace `https://kinsen.example.ts.net/mcp` with your endpoint):

```sh
# Claude Code
claude mcp add --transport http kinsen https://kinsen.example.ts.net/mcp --header "Authorization: Bearer PASTE_MCP_SECRET"
```

```json
// Cursor: ~/.cursor/mcp.json
{
  "mcpServers": {
    "kinsen": {
      "url": "https://kinsen.example.ts.net/mcp",
      "headers": { "Authorization": "Bearer PASTE_MCP_SECRET" }
    }
  }
}
```

```toml
# Codex: ~/.codex/config.toml. Keep the secret in an environment variable, not in the file.
[mcp_servers.kinsen]
url = "https://kinsen.example.ts.net/mcp"
bearer_token_env_var = "KINSEN_MCP_TOKEN"
```

Web connectors such as claude.ai and ChatGPT require OAuth 2.1 and are not supported by this change. That is a follow-up.

**Transport security is mandatory before any non-local use.** Never expose this endpoint over plain HTTP on the internet. The bearer token travels in every request, so anyone who can read the traffic can use it. Use one of these:

- **Tailscale (recommended, tailnet-only).** Keep the server on `127.0.0.1` and publish it with `tailscale serve` (HTTPS on your tailnet name), or bind the tailnet address with `KINSEN_MCP_HTTP_HOST=<tailnet IP>` plus `KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK=true`. Clients reach it only from devices on your tailnet.
- **Cloudflare Tunnel or a reverse proxy with HTTPS.** Terminate TLS at the proxy and forward to `127.0.0.1:3004`. Consider Cloudflare Access in front as a second factor, because a bearer token alone is the only gate at the server.

When the proxy forwards requests, the server sees the Host the client used. Set `KINSEN_MCP_HTTP_ALLOWED_HOSTS` to the exact `Host` value clients send, for example `kinsen.example.ts.net`, and check it with `curl -v`. Requests with other hosts get `403`. Non-browser clients send no `Origin` and are accepted. Browser origins must be listed in `KINSEN_MCP_HTTP_ALLOWED_ORIGINS`, and none are by default. Behind a proxy, all clients share the proxy's address for rate limiting.

| Variable | Default | Purpose |
|---|---|---|
| `KINSEN_MCP_TRANSPORT` | `stdio` | `stdio` or `http`. |
| `KINSEN_MCP_TOKEN` | required in `http` | MCP bearer secret, at least 32 characters, different from `KINSEN_BRIDGE_TOKEN`. |
| `KINSEN_MCP_HTTP_HOST` | `127.0.0.1` | Bind address. Any non-loopback value also needs `KINSEN_MCP_HTTP_ALLOW_NON_LOOPBACK=true`. |
| `KINSEN_MCP_HTTP_PORT` | `3004` | Listen port, 1 to 65535. |
| `KINSEN_MCP_HTTP_ALLOWED_HOSTS` | loopback names with the port | Comma-separated `Host` values accepted. Required for non-loopback binds. |
| `KINSEN_MCP_HTTP_ALLOWED_ORIGINS` | empty | Comma-separated exact browser origins accepted. |

Limits: request bodies are capped at 1 MiB, request timeouts are 30 s, and new sessions stop at 100. `SIGINT` and `SIGTERM` close sessions and the browser bridge before exit.

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

Asset history charts also provide an expandable table of all plotted dates and values.

The assets UI lives in `apps/web/src/features/assets/`. `AssetsPage.tsx` coordinates initialization, gold refresh, and asset/valuation/transfer dialogs. `AssetHistorySection` owns date-range controls and history calculations; `AssetHoldingsSection` owns grouped holdings and asset rows; `AssetLiabilitiesSection` owns liability actions, forms, confirmations, and paginated history. `AssetPositionSummary`, `AssetBreakdowns`, and `ArchivedAccountsSection` render the remaining sections. Keep section-specific state and derived data with the section that uses them; shared financial rules remain in `@kinsen/budget-domain`.

## PLN Token Tracker

Open `/electricity` from the desktop sidebar, mobile **More**, or command search. Record manual readings for one prepaid meter; each reading's balance is the post-refill balance when a top-up is attached. The tracker is not a live meter feed and does not look up PLN tariffs.

Usage follows balance conservation: opening balance plus credited top-ups after the opening reading, minus the latest balance. Unknown refill credit blocks affected usage and depletion estimates. An explicitly inferred refill remains provisional because a balance increase cannot reveal electricity consumed between readings. Monthly values cover the selected month’s observed dates; partial periods are not presented as full-calendar-month consumption.

The balance-change metric is a net balance delta that includes recorded refill credit; it is not an electricity-usage measure.

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
