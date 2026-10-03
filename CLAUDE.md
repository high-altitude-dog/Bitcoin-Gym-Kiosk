# Project context for Claude

- Build on the developer's own computer first; deploy to the Google Cloud VM later.
- Never put credentials (Coinos, Baneco, database) in code or in this file. Read them from environment variables in a `.env` file that the developer fills in and that is listed in `.gitignore`.
- Prices are always in Bs (BOB). Lightning amounts in sats are computed only when an invoice is created.

# Gym kiosk: high-level design

Exported from the design doc on Oct 1, 2026. The design doc is the source of truth; keep this file in sync with it.

## Overview

The kiosk lets gym members buy products on their own and pay by Bitcoin Lightning or by bank QR in bolivianos (Bs). It runs on MedusaJS, with Coinos for Lightning, the Baneco API for Bs payments, and Yadio for exchange rates.

There is one gym today. The design lets more gyms be added later without rework.

## Architecture

- **Kiosk tablet** (products, cart, payment QR) and **Medusa admin** (products, stock, orders) talk only to the Medusa backend.
- **Medusa backend** (one for all gyms): the Bolivia region (currency BOB), one stock location per gym, and the payment providers (Coinos and Baneco).
- **Postgres + Redis:** Medusa's data.
- **Yadio:** BOB/BTC rate, used when creating Lightning invoices.
- **Coinos** (Lightning only) auto-sweeps to the gym's Bitcoin wallet.
- **Baneco API** (bank QR in Bs) settles to the gym's Baneco account.

The kiosk and the admin only talk to Medusa. Medusa calls Yadio for rates and Coinos or Baneco for payments, which members pay from their own phones.

## Purchase flow

A sale is complete only when the payment provider confirms payment to Medusa.

1. The member picks items on the kiosk tablet.
2. Medusa builds the cart in Bs against this gym's stock location.
3. The member chooses Lightning or bank QR.
4. The provider creates a short-lived Lightning invoice (Coinos) or bank QR (Baneco), and the tablet shows it.
5. The member pays from a Lightning wallet or a bank app.
6. The provider confirms the payment to Medusa, by callback or polling depending on each API.
7. Medusa completes the order and reduces stock, and the tablet shows the purchase as done.

## Payments

Prices are always set and shown in Bs. Lightning amounts are converted to sats only when the invoice is created.

|  | Lightning | Bank QR |
| --- | --- | --- |
| Provider | Coinos | Baneco API |
| Member pays from | Any Lightning wallet | A bank app |
| Amount charged | Bs total converted to sats with the Yadio rate | Bs total |
| Funds go to | Coinos balance, then auto-swept when it passes a set threshold | The gym's Baneco account |

Rules:

- **Lightning only.** Coinos receives Lightning payments only, never on-chain. A payment is final as soon as Coinos confirms it.
- **Fresh rates.** Cache the Yadio BOB/BTC rate for about a minute. If the cached rate is too old and Yadio is unreachable, hide the Lightning option; bank QR keeps working.
- **Record what was charged.** Store the rate used and the sats amount on each Lightning order.
- **Reconcile against Coinos, not the wallet.** Sweeps move pooled funds, so match orders to incoming payments in Coinos's history.
- **Sweep threshold = maximum held at Coinos.** Set it by how much you are comfortable leaving with a custodial service.
- **Handle confirmations safely.** Receiving the same confirmation twice must not complete an order twice. A daily job compares provider records with Medusa orders.

## One gym now, room to grow

Today the setup is the smallest version of the design: one Medusa region, one stock location, and one kiosk tablet.

- **Region:** "Bolivia", currency BOB, with the Coinos and Baneco providers enabled. All future gyms share it, since they are all in Bolivia and sell in Bs.
- **Stock location:** named after this gym, not something generic like "Main warehouse", so nothing needs renaming later.
- **Adding a gym later:** a new stock location and a new tablet. No new region and no redesign.
- **Not built yet:** per-gym reports and stock transfers between gyms wait until a second gym exists.

## Decisions and non-goals

| Area | Decision |
| --- | --- |
| Commerce platform | MedusaJS. BTCPay Server is not part of this design. |
| Hosting | Google Cloud: one e2-medium Compute Engine VM (2 vCPU, 4 GB, Debian 13) in southamerica-west1 (Santiago) running Medusa, Postgres and Redis, with a 2–4 GB swap file so builds don't run out of memory. Upgrade the machine type if it gets slow. |
| Build approach | Build and test on the developer's own computer first (Claude Code in VS Code). Create the VM for the pilot and work on it through VS Code Remote-SSH. |
| Bitcoin payments | Coinos, Lightning only. No on-chain payments. |
| Bs payments | Baneco API |
| Exchange rates | Yadio |
| Withdrawals | Coinos balance-based auto-sweep. Medusa has no withdrawal logic. |
| Multiple gyms | Supported by the design; multi-gym features are deferred until a second gym exists. |

## Next steps and open items

Start Baneco access first, because it depends on the bank and takes the longest.

- [x] Write down the high-level design
- [x] Decide where Medusa runs: one e2-medium VM on Google Cloud, Debian 13
- [x] Choose the VM region: southamerica-west1 (Santiago)
- [ ] Request Baneco API access
- [x] Set up the local machine: VS Code, Node.js 20 or newer, PostgreSQL, Claude Code
- [x] Set up Medusa locally: the Bolivia region in BOB, this gym's stock location, the real product list (3 products so far; more to add)
- [x] Build the Coinos payment provider with Yadio rates (built and unit-tested against mocks; not yet called with a real Coinos token)
- [x] Build the kiosk storefront for the tablet (product grid, cart, the real Coinos Lightning payment screen, a bank QR placeholder, and app-shell resilience are built and tested against the real backend; layout tuning on the physical tablet is still open)
- [ ] Tune the kiosk layout on the real Tecno Megapad SE (needs the developer to open the kiosk on the device and send screenshots of the grid, cart, and Lightning QR screens — can't be done from assumed viewport dimensions)
- [ ] Create the VM with a swap file and deploy for the pilot
- [ ] Pilot with Lightning only, then add the Baneco provider when credentials arrive
- [ ] Set the Coinos auto-sweep threshold

# Current state and handoff

Written Oct 1, 2026 when work moved from the Claude desktop app to Claude Code in VS Code. The design above is unchanged; this section records what exists on disk. When the checklist above changes, mirror it in the design doc.

## What is built (local machine only)

- **Medusa v2.21.2** in `backend/` (Turborepo layout). The app is `backend/apps/backend/`. Run all Medusa commands from there.
- **Postgres 17** and **Redis 8** run as system services. Database `perseus`, role `medusa`. No sudo from Claude: ask the developer to run anything that needs it.
- **Redis is wired in** through `medusa-config.ts` when `REDIS_URL` is set (sessions, event bus, workflow engine, locking).
- **Region "Bolivia"** (BOB, country BO), **stock location "Armor Gym"**, **sales channel "Armor Gym Kiosk"** (the store default), and a free **"Armor Gym pickup"** shipping option (a cart needs one to complete). Region payment providers: `pp_system_default` and `pp_coinos-lightning_coinos-lightning`.
- **Products:** Whey Protein Concentrate - Chocolate (Bs 10), Creatine Monohydrate (Bs 3), Banana (Bs 1). Inventory is managed, 21 units each at Armor Gym. These prices look like test values.
- **Admin user** exists for the developer's own email (not recorded in the repo). The developer set the password. Never create or reset admin accounts for them.
- **Kiosk storefront** in `backend/apps/kiosk/` (Vite + React, `@dtc/kiosk`), with a publishable API key scoped to the Armor Gym Kiosk channel, created by `setup-armor-gym.ts` and stored in `backend/apps/kiosk/.env`.
- Git repo at the project root, one commit so far, no remote yet.

## Run it

```bash
cd ~/Documents/perseus/backend/apps/backend && npx medusa develop
cd ~/Documents/perseus/backend/apps/kiosk && npx vite --port 5173   # kiosk storefront
```

Health check: `http://localhost:9000/health`. Admin: `http://localhost:9000/app`. Kiosk: `http://localhost:5173`. Do not use `pkill -f` (it kills your own shell); stop servers by PID and check the port is free.

## Conventions and traps

- **Env files:** Medusa reads `backend/apps/backend/.env`. The root `.env` and `.env.example` are templates and hold the same keys. Put new variables in both `.env.example` files (placeholders only) and in `backend/apps/backend/.env`. When appending to an env file, make sure the previous line ends with a newline, or the two lines merge.
- **Prices are region prices only.** Set the Bolivia region price and never a plain BOB currency price, so there is one price per product and nothing to keep in sync. Amounts are whole bolivianos (10 means Bs 10).
- **Setup scripts live in `backend/apps/backend/src/scripts/`** and run with `npx medusa exec ./src/scripts/<name>.ts`. `setup-armor-gym.ts` is idempotent and is the way to rebuild the base data on the VM. `remove-demo-data.ts` was a one-off for the starter's Europe data.
- **Known harmless error:** deleting products logs `Search index "product" has no active version yet`. It does not break the operation. Fix it by migrating and seeding the search index when convenient.
- **Git identity is fixed:** commits use `high-altitude-dog <336328767+high-altitude-dog@users.noreply.github.com>` from the global git config. Never use the developer's real email in commits.
- **Credentials:** never ask for, print or commit them. They go in `.env` only.

## Coinos payment provider with Yadio rates

Built Oct 1, 2026 as `backend/apps/backend/src/modules/coinos-lightning/` (`CoinosLightningProviderService`, identifier `coinos-lightning`), registered under the payment module in `medusa-config.ts` and enabled on the Bolivia region by `setup-armor-gym.ts` (idempotent, same as the rest of that script). Also added:

- `src/api/store/lightning-availability` — a store route the kiosk calls to decide whether to show Lightning, backed by the Yadio rate cache (stale cache + unreachable Yadio → `{available: false}`; bank QR is unaffected).
- `src/jobs/reconcile-coinos-payments.ts` — a daily job (06:00) comparing Coinos's `GET /payments` history against Medusa orders for the previous day and logging mismatches.

Design notes:

- The Medusa payment session id is passed to Coinos as the invoice's `memo` at creation time, and Coinos echoes it back on the webhook callback — that's how a webhook call is tied back to the right cart, since Coinos invoices have no generic metadata field.
- A single static `COINOS_WEBHOOK_SECRET` (random, generated once, in `.env`) is sent on every invoice and checked against the `secret` Coinos echoes back on each webhook call, to reject forged callbacks.
- Lightning payments go straight from pending to `captured` (never a separate `authorized`-then-captured step), since Coinos settlement is instant and final on receipt. Idempotency on duplicate webhook deliveries is handled by Medusa core itself (`authorizePaymentSession` is documented and implemented as idempotent), not by custom code here.
- Confirmed by calling the live APIs directly and reading the open-source `coinos-server` code (coinos.io runs it), since both `coinos.io/docs` and `docs.yadio.io` are JS-rendered pages that couldn't be fetched directly. Unconfirmed: the exact full field list `GET /payments` returns per record — the reconciliation job matches defensively on several possible fields (`memo`, `hash`, `paymentHash`) rather than assuming one.
- Tested against mocked Coinos/Yadio HTTP clients only (`src/modules/coinos-lightning/__tests__/`, 22 tests, `npm run test:unit`). Nothing has called Coinos with the developer's real token yet — ask before doing that.

After this: build the kiosk storefront, load the full product list, then deploy to the VM. Baneco comes later when credentials arrive.

## Kiosk storefront plan (decided Oct 1, 2026)

Build after the Coinos provider. This is a new app, not a change to Medusa's admin or the starter's optional Next.js storefront (which was not installed).

- **Stack:** Vite + React, in `backend/apps/kiosk/`. Static files, no Node server at runtime, so it costs almost no memory on the e2-medium VM. Use Medusa's `@medusajs/js-sdk` against the Store API with the publishable key tied to the Armor Gym Kiosk channel.
- **Target device:** Tecno Megapad SE — 11" IPS, 1200x1920, 90Hz, ~207ppi, Android 15, Snapdragon 685, 4GB RAM (confirmed Oct 3, 2026). Portrait, run in a kiosk browser (Fully Kiosk Browser is the planned choice; check its current licence price). The OS/app-level portrait lock is configured on the device through Fully Kiosk Browser, not in code; the kiosk app has a CSS-only fallback (`#rotate-overlay` in `index.css`/`index.html`) that blocks interaction and asks to rotate if that lock isn't engaged. Pixel-level layout tuning still needs the physical tablet in hand.
- **Screens:** product grid, cart, payment (invoice QR with countdown), done. Big touch targets, Bs prices, "sold out" when stock is 0. No accounts, no keyboard input, anonymous carts.
- **Flow:** create a cart in the Bolivia region, add items, auto-select the "Armor Gym pickup" shipping option, create the payment session, show the QR, and wait for Medusa to complete the order. Never show "done" until Medusa confirms the order is complete.
- **Payment states:** handle paid, expired, cancelled and failed. Hide the Lightning option when the provider reports it unavailable (stale rate); bank QR must keep working.
- **Idle reset:** after about 60 seconds of no touch, clear the cart and return to the start screen, so one member's cart is never left for the next.
- **Resilience:** cache the app shell so a wifi blip shows a clear "reconnecting" message and not a blank page. A dropped connection mid-payment must never lose a paid order: orders complete on provider confirmation, not on the kiosk's state.
- **Development:** the tablet loads the app from the dev machine over the same wifi, so add that address to `STORE_CORS` in `backend/apps/backend/.env`. For the pilot, the app and Medusa sit on the VM behind HTTPS on a domain name (not yet decided).
- **Order of work:** product grid and cart against the real backend first, with the payment step mocked. Switch to the real Coinos provider when it is ready.

## Kiosk storefront: built so far (Oct 1, 2026)

Scaffolded as `backend/apps/kiosk/` (`@dtc/kiosk`, Vite + React + TypeScript), using `@medusajs/js-sdk` against the Store API. Product grid, cart (quantity stepper, running total) and a mocked payment screen are built and were driven end to end against the real backend with a headless browser: add item → view cart → pay → "Simulate payment" (authorizes with `pp_system_default` and completes the cart) → done screen with the order number. Idle reset (60s of no touch clears the cart and returns to the grid) is implemented but not yet tested on a real tablet.

Also added to `setup-armor-gym.ts` (idempotent, same pattern as the rest of that script):

- A publishable API key titled "Armor Gym Kiosk storefront", linked to the Armor Gym Kiosk sales channel. The token is logged on every run; copy it into `backend/apps/kiosk/.env` as `VITE_MEDUSA_PUBLISHABLE_KEY`.
- A fix that links any product missing a shipping profile to the store's default one. The three real products (Whey, Creatine, Banana) had no shipping profile set — however they were created, it wasn't through a workflow that assigned one — which made `cart.complete()` fail for every product with "shipping profiles not satisfied," regardless of payment method. This was caught by actually running the purchase flow, not by code review.

Gotcha hit while scaffolding: `npm create vite@latest -- --template react-ts` pulled Vite 8 (the new Rolldown-based engine) with `@vitejs/plugin-react` 6, which fails every request with `Missing field moduleType` from `builtin:vite-react-refresh-wrapper` — a blank page, not a readable error in the browser. Pinned `backend/apps/kiosk/package.json` to the known-stable pair (`vite` ^6.3.5, `@vitejs/plugin-react` ^4.3.4) instead. If re-scaffolding this app or starting a new Vite app in this repo, pin those versions from the start rather than taking whatever `create-vite` defaults to.

Not built yet: the "reconnecting" app-shell caching, and anything tablet-specific (Fully Kiosk Browser setup, portrait lock, real screen dimensions).

## Kiosk storefront: real Coinos payment screen (Oct 3, 2026)

Replaced the mocked payment screen with the real Lightning flow, in `backend/apps/kiosk/src/state/useKiosk.ts`, `src/screens/PaymentScreen.tsx`, and new `src/hooks/useCountdown.ts` and `src/lib/payment.ts`.

- **Flow:** after the shipping method is attached, the kiosk checks `/store/lightning-availability`, then calls `sdk.store.payment.initiatePaymentSession` with the coinos-lightning provider and reads `bolt11`/`sats_amount`/`bob_amount`/`expires_at` back off the created payment session's `data`. It renders the invoice as a QR code (the `qrcode` package, client-side, so it works without depending on the tablet's own internet) with a live mm:ss countdown to `expires_at`.
- **Polling without creating an order early:** the kiosk polls `GET /store/carts/:id` (not `cart.complete()`) every 3s, watching for the coinos-lightning payment session's `status` to become `"authorized"`. Only then does it call `cart.complete()` once. This matters because `cart.complete()` creates the order and reserves stock immediately even when payment is still pending — that's Medusa's documented behavior for async/deferred payment providers (confirmed by reading `completeCartWorkflow`, `authorizePaymentSessionStep`, and `processPaymentWorkflow` in `@medusajs/core-flows`) — so completing early would reserve stock against an invoice that might never get paid. Waiting for `"authorized"` means an expired, unpaid invoice leaves no order and no reservation behind.
- **Session status, not order status, drives the UI:** the Coinos webhook authorizes the payment session directly (via `processPaymentWorkflow`'s autocapture branch) regardless of whether an order exists yet, so polling the cart's session status works whether the webhook arrives before or after the kiosk would otherwise have called `complete()`.
- **Idle reset is paused** while a Lightning invoice is awaiting payment (`useIdleReset` now takes an `enabled` flag), since a member paying from their phone won't touch the tablet and that must not clear their cart mid-payment.
- **Retry re-initiates a fresh invoice** by calling `initiatePaymentSession` again; Medusa's `createPaymentSessionsWorkflow` deletes the old session and creates a new one (no split-payment support), so this just works without any extra cleanup code.
- **Known gap:** if the member cancels or walks away without the invoice expiring, there's no order to clean up (none was created) — but if `cart.complete()` ever returns `type: "cart"` after the session was already authorized (an unexpected-state error), that's surfaced as an inline cart error asking for a staff member, not silently retried.
- Verified end to end against the real backend and a real Coinos invoice (with the developer's explicit go-ahead to use the live token for one test invoice): added an item, paid screen rendered a real QR for a real `bolt11`, sats amount matched the live Yadio rate, and the countdown ticked down correctly. Did not complete a real payment (that needs a funded Lightning wallet) — the authorized → complete path is verified by reading Medusa's workflow source, not by an actual paid invoice.

## Kiosk storefront: bank QR placeholder (Oct 3, 2026)

The cart screen now shows two buttons, "Pay with Lightning" and "Pay with bank QR" (`CartScreen.tsx`), matching the design doc's "member chooses Lightning or bank QR" step. Bank QR is a placeholder until Baneco access arrives (request in progress — see the checklist): selecting it (`useKiosk.startBankQrPayment`) attaches the shipping method the same as the Lightning path, then shows a static dashed square with the text "QR goes here" (`PaymentScreen.tsx`, `.payment-qr--placeholder` in `App.css`) and a Bs total. No invoice, no session, no polling — it's purely a visual stand-in. Swap in the real Baneco flow (provider, invoice/QR creation, polling or callback) in that branch once credentials arrive; the Lightning branch is the template to follow.

## Kiosk storefront: app-shell resilience (Oct 3, 2026)

Implements the design doc's resilience requirement ("cache the app shell so a wifi blip shows a clear 'reconnecting' message and not a blank page"):

- **Service worker precaching:** `vite-plugin-pwa` (`vite.config.ts`, registered in `main.tsx` via `virtual:pwa-register`) precaches the built JS/CSS/HTML in `generateSW` mode with `navigateFallback: 'index.html'`, so a reload while offline still serves the cached app shell instead of the browser's own offline error page. No installable-PWA manifest (`manifest: false`) — this is an offline-first shell, not something meant to be "installed." Updates are silent (`registerType: 'autoUpdate'`, `registerSW({ immediate: true })`): a kiosk has no one to click "update available."
  - **Gotcha:** `vite-plugin-pwa` gets hoisted to the workspace root by npm, and resolves its own `vite` types against the root's vite (pulled to ^7 by `apps/backend`'s admin build tooling), while this app is deliberately pinned to vite ^6.3.5 (see the Vite-8/Rolldown gotcha above) and gets its own nested copy — same package, two structurally-incompatible type identities. Fixed with a `VitePWA(...) as unknown as PluginOption` cast in `vite.config.ts` rather than fighting the hoisting.
  - Verified by building, serving the production build (`vite preview`), loading it once online, then going offline and reloading in a headless browser: no navigation error, the page still rendered (`#root` present, body showed "Reconnecting... / Loading...") instead of a blank/browser error page.
- **Live "Reconnecting..." banner:** `useOnlineStatus` (tracks `navigator.onLine` plus the browser's `online`/`offline` events) drives a fixed banner rendered at the `App` level regardless of screen, so a wifi blip is visible whether the member is browsing, in the cart, or mid-payment. It does not interrupt an in-progress Lightning poll — `pollForPayment` already swallows transient fetch errors and keeps trying, per the "a dropped connection mid-payment must never lose a paid order" rule.
- **Auto-recovery:** if the initial catalog load fails (screen is still "grid", no cart exists yet, so there's nothing to lose) and connectivity returns, the kiosk retries automatically (`kiosk.reset()`) instead of waiting for a tap on "Retry." Verified: toggling Playwright's offline mode shows/hides the banner correctly.
- Not done: the layout hasn't been tuned against the actual Tecno Megapad SE hardware yet (only against an assumed ~800x1280 CSS px portrait viewport); that needs the physical device.
