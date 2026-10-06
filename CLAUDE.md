# Project context for Claude

- Build on the developer's own computer first; deploy to the Google Cloud VM later.
- Never put credentials (Coinos, Baneco, database) in code or in this file. Read them from environment variables in a `.env` file that the developer fills in and that is listed in `.gitignore`.
- Prices are always in Bs (BOB). Lightning amounts in sats are computed only when an invoice is created.
- **This file currently describes one specific gym's instance**: the gym name ("Armor Gym"), its product catalog, the GCP region, the admin email, the git author identity, and the tablet model are all specific to that deployment, not structural requirements. Reusing this file for a different gym or as a template means replacing those first.

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
| Funds go to | Coinos balance; auto-sweep stays off initially (see Decisions and non-goals) | The gym's Baneco account |

Rules:

- **Lightning only.** Coinos receives Lightning payments only, never on-chain. A payment is final as soon as Coinos confirms it.
- **Fresh rates.** Cache the Yadio BOB/BTC rate for about a minute. If the cached rate is too old and Yadio is unreachable, hide the Lightning option; bank QR keeps working.
- **Record what was charged.** Store the rate used and the sats amount on each Lightning order.
- **Reconcile against Coinos, not the wallet.** Sweeps move pooled funds, so match orders to incoming payments in Coinos's history.
- **Sweep threshold = maximum held at Coinos.** Set it by how much you are comfortable leaving with a custodial service. Decided Oct 3, 2026: no auto-sweep for the pilot — turning it on adds a second place (the gym's own wallet) that payments have to be reconciled against, and the business operator would rather keep that simple while volume is low. Revisit once there's enough volume that leaving funds at Coinos becomes the bigger risk than the reconciliation overhead.
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
| Hosting | Google Cloud: one e2-medium Compute Engine VM (2 vCPU, 4 GB, Debian 13) in southamerica-west1 (Santiago) running Medusa, Postgres and Redis, with a 2–4 GB swap file so builds don't run out of memory. Upgrade the machine type if it gets slow. Project `perseus-armor-coinos`; instance `armor-gym-kiosk` in zone `southamerica-west1-a`. |
| Build approach | Build and test on the developer's own computer first (Claude Code in VS Code). Create the VM for the pilot and work on it through VS Code Remote-SSH. |
| Bitcoin payments | Coinos, Lightning only. No on-chain payments. |
| Bs payments | Baneco API |
| Exchange rates | Yadio |
| Withdrawals | Coinos supports balance-based auto-sweep, but it stays off for the pilot by choice (simpler reconciliation while volume is low) — not a technical limitation. Medusa has no withdrawal logic either way. |
| Multiple gyms | Supported by the design; multi-gym features are deferred until a second gym exists. |

Notes on creating the VM (Oct 3, 2026), for next time:

- Used the Google Compute Engine MCP connector (`claude.ai Google Compute Engine`), not `gcloud` (not installed locally). Its `create_instance` tool only takes project/zone/name/machineType/imageFamily/imageProject/guestAccelerators/maintenancePolicy — no metadata, no SSH keys, no boot disk size. SSH access has to be added afterward through the Console (instance → Edit → SSH Keys), or use the Console's browser-based SSH button, which needs no key at all for whoever has the right IAM role on the project.
- `create_instance` without an explicit `maintenancePolicy` fails for e2 instances (`"e2 instances do not support onHostMaintenance=TERMINATE unless they are preemptible"`) even though the tool's own docs say it defaults to MIGRATE. Pass `maintenancePolicy: "MIGRATE"` explicitly.
- A brand-new GCP project returns a plain 403 from every Compute Engine call until both the Compute Engine API is enabled and a billing account is linked — the error message doesn't say which, so check both in the Console (APIs & Services → Enabled APIs, and Billing) if this happens again on a new project.
- **Reserve the external IP as static** (Console → VPC network → IP addresses → find the ephemeral IP next to `armor-gym-kiosk` → Reserve — same IP, no downtime) before pointing a domain or `MEDUSA_BACKEND_URL` at it. An ephemeral IP can change if the instance is ever stopped and restarted, which would silently break the domain and the Coinos webhook URL. The Compute Engine MCP connector has no tool for this (it covers instances/disks/images/machine types/templates/compute-capacity reservations/commitments/snapshots, not VPC IP addresses) — do it through the Console.

## Getting credentials

None of these are in this file or in code — they go in `.env` only (see `.env.example` for the exact variable names).

- **Coinos:** sign up at coinos.io, then generate an API token from account settings. That's `COINOS_API_TOKEN`; `COINOS_API_URL` is `https://coinos.io/api`.
- **`COINOS_WEBHOOK_SECRET`:** not issued by anyone — generate your own long random value once, e.g. `openssl rand -hex 32`, and never reuse it elsewhere.
- **`MEDUSA_BACKEND_URL`:** must be publicly reachable over the internet for Coinos's webhook to ever arrive (see the "known gap" note under the Coinos provider section below) — `localhost` only works once deployed, or tunneled with something like ngrok.
- **Yadio:** no signup or key needed; it's a public API (`YADIO_API_URL=https://api.yadio.io`).
- **Baneco:** apply through the bank directly. This is the business owner's task, not the developer's or Claude's — it's a relationship with the bank, not a technical setup step. It's also the slowest credential to get, so it should start as early as possible regardless of how far along everything else is.

## Next steps and open items

Start Baneco access first, because it depends on the bank and takes the longest. That request is the business owner's task, not Claude's or the developer's — it's a relationship with the bank, not a technical step, so it doesn't show up as something to build or chase here.

- [x] Write down the high-level design
- [x] Decide where Medusa runs: one e2-medium VM on Google Cloud, Debian 13 (reconsidered e2-small for cost on Oct 3, 2026; stayed with e2-medium — see Decisions and non-goals)
- [x] Choose the VM region: southamerica-west1 (Santiago)
- [ ] Baneco API access (business owner's task — see Getting credentials)
- [x] Set up the local machine: VS Code, Node.js 20 or newer, PostgreSQL, Claude Code
- [x] Set up Medusa locally: the Bolivia region in BOB, this gym's stock location, the real product list (3 products so far; more to add)
- [x] Build the Coinos payment provider with Yadio rates (built and unit-tested against mocks; not yet called with a real Coinos token)
- [x] Build the kiosk storefront for the tablet (product grid, cart, the real Coinos Lightning payment screen, a bank QR placeholder, and app-shell resilience are built and tested against the real backend; layout tuning on the physical tablet is still open)
- [ ] Tune the kiosk layout on the real Tecno Megapad SE (needs the developer to open the kiosk on the device and send screenshots of the grid, cart, and Lightning QR screens — can't be done from assumed viewport dimensions)
- [x] Create the VM: `armor-gym-kiosk`, e2-medium, `southamerica-west1-a`, Debian 13, project `perseus-armor-coinos` (created Oct 3, 2026 via the Google Compute Engine MCP connector)
- [x] Reserve the VM's external IP as static: `34.176.250.72`
- [x] SSH in, add the swap file, install Postgres/Redis/Node, and deploy Medusa to the VM (Oct 3, 2026 — see "Deploying to the VM" below for the full runbook and gotchas). Admin reachable at `http://34.176.250.72:9000/app`; region, stock location, sales channel, and the real 3-product catalog all set up and verified via the Store API.
- [x] Deploy the kiosk build to the VM (Oct 6, 2026): served by nginx from `/var/www/kiosk` at `https://paywithbitcoin.lol` — see "Domain and HTTPS" below
- [x] Take a GCP snapshot of `armor-gym-kiosk` before linking the static IP to a domain (done by the developer, Oct 6, 2026)
- [x] Domain and HTTPS (Oct 6, 2026): temporary domain `paywithbitcoin.lol` (Porkbun), kiosk at the apex, Medusa at `api.`, nginx + Let's Encrypt — see "Domain and HTTPS" below. The domain will change later.
- [x] Rewrite the 3 products' stored image URLs from `http://34.176.250.72:9000/static/...` to `https://api.paywithbitcoin.lol/static/...` (Oct 6, 2026, SQL `replace()` on `product.thumbnail` and `image.url`)
- [x] Remove the temporary `allow-medusa-9000` firewall rule (Oct 6, 2026, by the developer in the Console). Port 9000 no longer answers from outside; Medusa is reachable only through nginx.
- [x] Real payment test against the deployed backend (Oct 6, 2026): a Bs 1 Banana paid from a phone wallet (98 sats). Coinos's webhook reached `https://api.paywithbitcoin.lol/hooks/payment/pp_coinos-lightning_coinos-lightning` (200), the kiosk completed the cart 6 s later, order #1 was created with a Bs 1 capture (not the sats figure), 1 unit was reserved at Armor Gym (Medusa lowers `stocked_quantity` only on fulfilment; available went 21 → 20), and the Slack sale alert was sent (`success`). The first end-to-end paid order with the webhook working.
- [ ] Pilot with Lightning only, then add the Baneco provider when credentials arrive
- [ ] Turn on Coinos auto-sweep and set its threshold — deliberately off for the pilot (see Decisions and non-goals); revisit once volume justifies it, kept open rather than closed as "won't do"
- [ ] Design in "pay with cash" and "pay later" as additional payment options on the kiosk — backburner, not needed for the pilot; consider once the gym is live and the Lightning/bank-QR flow is proven out
- [x] Slack alerts for sales, low stock, paid-but-no-order and reconciliation mismatches (Oct 4, 2026; see "Slack alerts" below)
- [ ] Consider a separate Coinos account for local development: the shared account means every local test payment shows up as a reconciliation mismatch on the VM
- [ ] Refactor `coinos-lightning` into a standalone, publishable Medusa plugin other MedusaJS users could install — backburner, not needed for the pilot. Estimated ~3-5 focused days: the real cost is generalizing the currency handling (BOB is hardcoded throughout the Yadio client and session data today — `/rate/BTC/BOB`, `btcPerBob`, `bob_amount`, etc. — not just this project's setup script), plus packaging, a real README for strangers, and deciding whether to bundle the `lightning-availability` route and the reconciliation job. Also bundle the constant-time webhook-secret comparison fix (flagged in the Oct 3, 2026 security review, cheap, not yet applied) while touching this file anyway.

# Current state and handoff

Written Oct 1, 2026 when work moved from the Claude desktop app to Claude Code in VS Code. The design above is unchanged; this section records what exists on disk. When the checklist above changes, mirror it in the design doc.

## What is built (local machine only)

- **Medusa v2.21.2** in `backend/` (Turborepo layout). The app is `backend/apps/backend/`. Run all Medusa commands from there.
- **Postgres 17** and **Redis 8** run as system services. Database `perseus`, role `medusa`. No sudo from Claude: ask the developer to run anything that needs it.
- **Redis is wired in** through `medusa-config.ts` when `REDIS_URL` is set (sessions, event bus, workflow engine, locking).
- **Region "Bolivia"** (BOB, country BO), **stock location "Armor Gym"**, **sales channel "Armor Gym Kiosk"** (the store default), and a free **"Armor Gym pickup"** shipping option (a cart needs one to complete). Region payment providers: `pp_system_default` and `pp_coinos-lightning_coinos-lightning`.
- **Products:** Whey Protein Concentrate - Chocolate (Bs 10), Creatine Monohydrate (Bs 3), Banana (Bs 1). Inventory is managed, 21 units each at Armor Gym. These prices look like test values.
- **Admin user** exists for the developer's own email (not recorded in the repo). The developer set the password. Never create or reset *that* account — this isn't a blanket rule against ever creating an admin user; if no admin user exists yet (e.g. a fresh setup), create one and ask the developer to set its password.
- **Kiosk storefront** in `backend/apps/kiosk/` (Vite + React, `@dtc/kiosk`), with a publishable API key scoped to the Armor Gym Kiosk channel, created by `setup-armor-gym.ts` and stored in `backend/apps/kiosk/.env`.
- Git repo at the project root, one commit so far, no remote yet.

## Run it

```bash
cd ~/Documents/perseus/backend/apps/backend && npx medusa develop
cd ~/Documents/perseus/backend/apps/kiosk && npx vite --port 5173   # kiosk storefront
```

Health check: `http://localhost:9000/health`. Admin: `http://localhost:9000/app`. Kiosk: `http://localhost:5173`. Do not use `pkill -f` (it kills your own shell); stop servers by PID and check the port is free.

**Stopping `medusa develop` properly** (learned Oct 4, 2026): it's a watcher (`medusa develop`) plus a server child (`@medusajs/cli/cli.js start --types`). Killing only the process on port 9000 doesn't stop it: the watcher starts a new child. And every restart after a file edit can leave the old child running on its own, with no port, but still connected to the database and Redis, so it keeps running scheduled jobs and event subscribers. One such leftover silently served requests for a whole session. To stop everything, list them with `ps -eo pid,cmd | grep -E "[@]medusajs/cli/cli.js|[m]edusa develop"` (the brackets stop `grep` from matching itself), `kill` every PID listed, and run the same command again: it should print nothing.

## Conventions and traps

- **Env files:** Medusa reads `backend/apps/backend/.env`. The root `.env` and `.env.example` are templates and hold the same keys. Put new variables in both `.env.example` files (placeholders only) and in `backend/apps/backend/.env`. When appending to an env file, make sure the previous line ends with a newline, or the two lines merge.
- **Prices are region prices only.** Set the Bolivia region price and never a plain BOB currency price, so there is one price per product and nothing to keep in sync. Amounts are whole bolivianos (10 means Bs 10).
- **Setup scripts live in `backend/apps/backend/src/scripts/`** and run with `npx medusa exec ./src/scripts/<name>.ts`. `setup-armor-gym.ts` is idempotent and is the way to rebuild the base data on the VM. `create-armor-gym-products.ts` (Oct 3, 2026) does the same for the real 3-product catalog — see "Product catalog script" below. `remove-demo-data.ts` was a one-off for the starter's Europe demo data.
- **Known bug, not yet fixed:** `remove-demo-data.ts` calls `deleteProductsWorkflow` and then a separate `inventory.deleteInventoryItems(invIds)` on the same inventory items — in this Medusa version (2.21.2), `deleteProductsWorkflow` already deletes each variant's inventory item itself, so the follow-up call fails (found while writing `create-armor-gym-products.ts` and testing a product delete the same way). Since that script is a one-off already run and not needed again, this hasn't been fixed — but don't copy that two-step delete pattern elsewhere; one call is enough.
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
- The webhook result deliberately has **no `amount`**. Coinos reports amounts in sats, but Medusa's `processPaymentWorkflow` passes that value to `capturePaymentWorkflow` as the capture amount in the payment's currency (Bs) and records it on the order: before Oct 3, 2026 a Bs 10 order could be recorded as a Bs 1,430 capture. With no amount, Medusa captures the full authorized amount, which is always right for an invoice that's paid in full or not at all. (The `WebhookActionData` type says `amount` is required; it's cast, with a comment.)
- **Coinos cannot cancel or delete an invoice.** Its API (checked in `coinos-server`'s route table) has create, get, list, and an update that only changes the tip or the webhook. So every invoice stays payable until its Lightning expiry, whatever the kiosk does. `cancelPayment`/`deletePayment` are no-ops for that reason, and the kiosk avoids replacing a live invoice instead (see "Code review fixes" below).
- Confirmed by calling the live APIs directly and reading the open-source `coinos-server` code (coinos.io runs it), since both `coinos.io/docs` and `docs.yadio.io` are JS-rendered pages that couldn't be fetched directly. Unconfirmed: the exact full field list `GET /payments` returns per record — the reconciliation job matches defensively on several possible fields (`memo`, `hash`, `paymentHash`) rather than assuming one.
- Tested against mocked Coinos/Yadio HTTP clients only (`src/modules/coinos-lightning/__tests__/`, 22 tests, `npm run test:unit`). Nothing has called Coinos with the developer's real token yet — ask before doing that.
- **Known gap: webhooks can't reach a local backend.** Confirmed Oct 3, 2026 by actually paying a real test invoice from a phone wallet: Coinos confirmed the payment on its end, but the kiosk never saw it, because `MEDUSA_BACKEND_URL` was `http://localhost:9000` — not reachable from the public internet, so Coinos has nowhere to deliver the webhook. The invoice really was paid; Medusa just never found out. Unblocked it by calling `POST /store/carts/:id/complete` directly, which re-checks Coinos's live invoice state independently of the webhook (the same check `authorizePayment` always does) and completed the order correctly. This only matters for local testing — once deployed, `MEDUSA_BACKEND_URL` points at a real public URL and the webhook works as designed. For local testing before that, either tunnel the backend (e.g. ngrok) or expect to complete payment-confirmed carts manually the same way.

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
- **Polling without creating an order early:** the kiosk polls `GET /store/carts/:id` (not `cart.complete()`) every 0.5 s (3 s until Oct 6, 2026; a tick still waiting on the network makes the next one skip), watching for the coinos-lightning payment session's `status` to become `"authorized"`. Only then does it call `cart.complete()` once. This matters because `cart.complete()` creates the order and reserves stock immediately even when payment is still pending — that's Medusa's documented behavior for async/deferred payment providers (confirmed by reading `completeCartWorkflow`, `authorizePaymentSessionStep`, and `processPaymentWorkflow` in `@medusajs/core-flows`) — so completing early would reserve stock against an invoice that might never get paid. Waiting for `"authorized"` means an expired, unpaid invoice leaves no order and no reservation behind.
- **Session status, not order status, drives the UI:** the Coinos webhook authorizes the payment session directly (via `processPaymentWorkflow`'s autocapture branch) regardless of whether an order exists yet, so polling the cart's session status works whether the webhook arrives before or after the kiosk would otherwise have called `complete()`.
- **Idle reset is paused** while a Lightning invoice is awaiting payment (`useIdleReset` now takes an `enabled` flag), since a member paying from their phone won't touch the tablet and that must not clear their cart mid-payment. Also paused while a paid order is waiting on staff (`needs_staff`, below).
- **Retry re-initiates a fresh invoice** by calling `initiatePaymentSession` again; Medusa's `createPaymentSessionsWorkflow` deletes the old session and creates a new one (no split-payment support). Retry is only offered once the invoice has expired, i.e. when the old one can no longer be paid. (Superseded Oct 3, 2026 — see "Code review fixes": Cancel no longer discards a live invoice, and the polling, expiry, and paid-but-no-order handling all changed.)
- **If `cart.complete()` returns `type: "cart"`** after the session was already authorized (an unexpected-state error), the kiosk shows a "tell a staff member" screen with the cart id as a reference, no buttons, and no idle reset, since the member has paid. It never retries payment from there.
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

## Deploying to the VM (Oct 3, 2026)

The Medusa backend is live on `armor-gym-kiosk` (`34.176.250.72`), reachable at `http://34.176.250.72:9000` (admin at `/app`). Done via SSH from Claude Code, not VS Code Remote-SSH (that's still how the developer would connect for ongoing work — see "SSH access" below). The kiosk app itself is **not** deployed yet; only the backend. What follows is the actual runbook, written from what worked, plus every gotcha hit along the way so the next deploy (or a redeploy after a Baneco/HTTPS change) doesn't rediscover them.

**SSH access:** the Google Compute Engine MCP connector's `create_instance` has no metadata/SSH-key parameter, so there's no way to provision access through it. An ed25519 key was added manually via the Console (instance → Edit → SSH Keys) for a `claude` user, who has passwordless sudo (`google-sudoers` group — this is standard for any key added this way, not something configured separately). The developer should add their own key the same way for Remote-SSH.

**Runbook, in order:**

1. `ssh claude@34.176.250.72`, then grow the disk: GCP's `create_instance` has no boot-disk-size parameter either, so it defaults to 10GB. Resized to 30GB via Console (Disks tab → Edit → resize — online, no downtime, cannot shrink later), then on the VM: `sudo apt-get install -y cloud-guest-utils` (for `growpart`, not preinstalled) → `sudo growpart /dev/sda 1` → `sudo resize2fs /dev/sda1`. GCP resizing the disk does **not** resize the partition/filesystem automatically; both of those steps are required separately.
2. Swap file: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`, persisted via `/etc/fstab` (`/swapfile none swap sw 0 0`) and `vm.swappiness=10` in `/etc/sysctl.conf` (file didn't exist yet on this Debian 13 image; `tee -a` creates it).
3. Postgres, Redis, Node, npm, git, build-essential are all in Debian 13's default apt repos at exactly the versions this project already uses locally (Postgres 17, Redis 8, Node 20.19, npm 9.2) — no third-party repos (NodeSource, apt.postgresql.org) needed. `sudo apt-get install -y postgresql redis-server nodejs npm git build-essential`. Both services auto-start and auto-enable on install.
4. Create the DB role/database: `sudo -u postgres psql -c "CREATE ROLE medusa WITH LOGIN PASSWORD '...';" -c "CREATE DATABASE perseus OWNER medusa;"` — a freshly generated password, not the local dev one.
5. Get the code onto the VM. There's no git remote, so this was a `tar czf - . | ssh ... tar xzf -` from the dev machine (excluding `node_modules`, `.env*`, `.medusa`, `dist`, `build`), landing at `~/perseus`. Full git history came along since `.git` wasn't excluded.
6. `.env`: copy the non-secret values (`COINOS_API_URL`, `YADIO_API_URL`) and the Coinos token from local dev (same real Coinos account — see "Getting credentials" above for why), but generate **fresh** `JWT_SECRET`, `COOKIE_SECRET`, `AUTH_MFA_ENCRYPTION_KEY`, and `COINOS_WEBHOOK_SECRET` — never reuse local dev's (especially since local dev's `JWT_SECRET`/`COOKIE_SECRET` are literally `supersecret`). Set `MEDUSA_BACKEND_URL=http://34.176.250.72:9000` and CORS vars to match. `DATABASE_URL` uses the VM's own fresh Postgres password.
7. `cd backend && npm install` (workspace root — this is the normal TypeScript source tree, ~1.7k packages, several minutes).
8. `npx medusa db:migrate` from `backend/apps/backend` — this also runs the starter's own `initial-data-seed.ts` migration script, which seeds its default Europe demo region/products. That's expected; step 10 removes it.
9. `npx medusa exec ./src/scripts/setup-armor-gym.ts`. **First run fails** on a fresh database: it looks up an existing admin user to attribute the publishable API key to, and there isn't one yet (`Cannot read properties of undefined (reading 'id')` at the `users[0].id` line). Create one first — `npx medusa user -e <email> -p <password>` — then re-run; it's idempotent and picks up exactly where it left off (region/stock-location/channel already exist and aren't duplicated).
10. `npx medusa exec ./src/scripts/remove-demo-data.ts` to clear the starter's Europe demo data (must run after step 9 — it throws if the Armor Gym records don't exist yet, by design).
11. **The 3 real products had no creation script** at the time of this first deploy — they were made through the Admin UI, not captured anywhere in code. Recreated them directly via the Admin API (`POST /admin/products`, region-scoped `bob` price via a `region_id` price rule per the "region prices only" convention, then `POST /admin/inventory-items/:id/location-levels` for the 21-unit stock, then `POST /admin/uploads` + `POST /admin/products/:id` for images). **Closed Oct 3, 2026:** `npx medusa exec ./src/scripts/create-armor-gym-products.ts` now does this step — see "Product catalog script" below. Use it instead of the manual Admin API calls on the next redeploy.
12. Production build and run — see the next section, this is the part with the real traps. Use `./scripts/build.sh` (from `backend/apps/backend`) instead of running `npx medusa build` directly — see below for why.

**Building and running Medusa in production — three traps, in the order they bite:**

- `medusa build` (from `backend/apps/backend`) produces `.medusa/server`: a **fully standalone deployable app** with its own `package.json`, decoupled from the source tree. `medusa start` must be run from **inside** `.medusa/server`, not from `apps/backend` — running it from the source directory fails with `Could not find index.html in the admin build directory`, because `@medusajs/medusa`'s admin loader resolves the admin build path as `<rootDirectory>/public/admin`, and `rootDirectory` is wherever `start` is invoked *from* (`process.cwd()`), not wherever `build` was invoked from. `.medusa/server` needs its own `npm install` (full ~1.7k packages again, it's a separate tree) and its own copy of `.env`.
- **Every `medusa build` deletes and recreates `.medusa/server` from scratch** ("Removing existing .medusa/server folder" in its own log output). That wipes the `.env` copy, the `node_modules` just installed there, and (the one that actually cost time here) **any files uploaded through the admin while running**, since Medusa's local file provider defaults to writing uploads under `<cwd>/static`, i.e. `.medusa/server/static`. All three need redoing after every rebuild: re-copy `.env`, `npm install` again, re-upload anything that was uploaded (product images, etc.). **Do not** try to fix the upload-loss problem with the file-local provider's `upload_dir` option — it only changes where uploads are *written*, not where `GET /static/*` *serves from*. That route is hardcoded in `@medusajs/framework`'s `express-loader.js` to `express.static(path.join(baseDir, "static"))` with the comment "Currently we don't allow configuration of static files" — pointing `upload_dir` elsewhere just makes every uploaded file 404. (Tried this, confirmed it breaks, reverted.) **Closed Oct 3, 2026:** `backend/apps/backend/scripts/build.sh` wraps `medusa build` and handles all three automatically — see "Build script" below.
- The local file provider's `backend_url` option is **not optional** for a real deploy: unconfigured, it hardcodes `http://localhost:9000/static` into every uploaded file's URL (`@medusajs/file-local`'s own fallback), which only ever worked locally by coincidence (`MEDUSA_BACKEND_URL` is also `localhost` there). Fixed in `medusa-config.ts` by adding a `file` module block with `backend_url: ${process.env.MEDUSA_BACKEND_URL}/static` — this is now in source control, so it's a one-time fix, not a per-deploy step.

**Updating the code on the VM** (there's no git remote, so it's a git bundle; first done Oct 4, 2026): on the dev machine, `git bundle create perseus.bundle <VM's HEAD>..main` and `scp` it over. On the VM, in `~/perseus`: `git fetch ~/perseus.bundle main:refs/remotes/bundle/main && git merge --ff-only bundle/main`. Check `git status` there first: on Oct 4 the VM had an uncommitted copy of the deploy-day `medusa-config.ts` fix. It was identical to the committed version and was stashed, not discarded (`git stash list`). Then `sudo systemctl stop medusa`, `./scripts/build.sh` from `backend/apps/backend`, and `sudo systemctl start medusa`. Expect about 6 minutes of downtime, mostly `npm install`. `medusa build` deletes the folder the running service uses, which is why the service is stopped first. Run it detached (`nohup`) so a dropped SSH connection can't leave the build half-done. Re-run the root `npm install` only when `backend/apps/backend`'s dependencies change.

**Running it persistently:** a systemd service, since `medusa develop`/`start` dying with the SSH session would take the backend down with it. `/etc/systemd/system/medusa.service`:

```ini
[Unit]
Description=Medusa backend (Armor Gym kiosk)
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=claude
WorkingDirectory=/home/claude/perseus/backend/apps/backend/.medusa/server
ExecStart=/usr/bin/npx medusa start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now medusa.service`. Startup takes ~9-11 seconds from process start to "Server is ready" — don't conclude it failed from a health check run too soon after a restart.

**Networking:** the static IP and the `allow-medusa-9000` firewall rule (0.0.0.0/0 → TCP 9000) are both temporary stand-ins for a real domain + HTTPS + nginx setup, tracked as open checklist items above. Port 9000 open to the whole internet is fine for getting things verified now, not for the actual pilot.

**Verification:** health check (`/health`), admin login (`POST /auth/user/emailpass`), and the Store API product listing (`GET /store/products` with the kiosk's publishable key) all confirmed working with real data matching local dev exactly (titles, Bs 10/3/1 prices, 21-unit stock, images). Did not yet test the kiosk app itself against this deployed backend, or a real Coinos webhook against it (needs HTTPS first, per the checklist item above).

## Kiosk storefront: dark-theme redesign ("Kiosko Byte, La Paz") (Oct 3, 2026)

The developer designed a new visual system for the kiosk — dark theme, a "Byte" mascot and La Paz landmark wall art, a 1200×1920 portrait stage sized for the real Tecno Megapad SE, Spanish copy, an orange-only-for-actions token system — and shared it as a self-contained design/code kit. **"Kiosko Byte, La Paz" is purely the name of this visual theme, not a rename**: Armor Gym stays the real business name everywhere in data, docs, and infra; confirmed the kit's own code has no gym name or brand string in its UI text anywhere, only in the wall-art images.

**Architecture decision:** the kit shipped its own complete cart lifecycle (`useOrder`/`useCatalog`/`medusaBackend()`, its own `localStorage` cart id) meant to run as a self-contained `<KioskApp onCheckout={...}>`. That was **not** adopted as-is — running it alongside the existing `useKiosk.ts` (which already owns cart creation, shipping-method attachment, Coinos invoice creation, and the poll-then-complete logic verified against a real paid invoice) would have created two independent Medusa carts per customer. Instead, only the kit's **presentation layer** was ported — components, CSS tokens, Spanish strings, the fixed-stage scaling mechanism — onto the existing `useKiosk.ts` state machine, which was otherwise left untouched.

- **Screens:** `grid`+`cart` collapsed into one merged `idle`→`shop` flow (tap-to-start wall, then a product grid with an inline order bar — no separate cart screen). A new `payment-method` screen (`src/screens/PaymentMethodScreen.tsx`) was added to hold the Lightning-vs-bank-QR choice, since the kit's single "Pagar" button has no concept of payment methods at all — that choice used to live as two buttons on the old `CartScreen.tsx` (deleted). `PaymentScreen.tsx`/`DoneScreen.tsx` (the real, Coinos-verified Lightning flow) were kept logically untouched — only their CSS was repainted to the dark theme, and their hardcoded English text was translated to Spanish, so the whole kiosk now reads consistently in Spanish.
- **New files:** `src/tokens.css`/`src/kiosk.css` (the design-token system and `k-`-prefixed component styles, including a hand-written `.k-method` block for the new payment-method screen, which isn't part of the kit), `src/screens/{Stage,CategoryChips,IdleScreen,ProductCard,OrderBar,ShopScreen,PaymentMethodScreen}.tsx`, `src/hooks/{useStageScale,useClock,useFitText}.ts`, `src/lib/{format,kioskTypes,kioskMapping,stageConfig,strings}.ts`, `public/kiosk/wall-{idle,shop}(.webp|@2x.webp)` (the real wall art).
- **Category support added but dormant:** `useKiosk.ts` now fetches top-level product categories alongside products and exposes them; `CategoryChips` renders correctly today (just "Todo", since 0 categories exist for the 3 real products) and will pick up real categories automatically if the gym adds them via Admin later — no `setup-armor-gym.ts` change needed either way.
- **New dependency:** `@fontsource/inter` (self-hosted Latin + Latin-ext, weights 500/600/700, matching the kiosk's existing offline-resilience design). `vite.config.ts`'s PWA `globPatterns` was extended to include `webp` and `woff2` — neither was covered before, so the wall art and fonts wouldn't have survived an offline reload without this fix.
- **Verified** with a headless-browser click-through against the **real deployed backend** (not mocked): idle → shop renders the 3 real products with correct Bs prices → add/increment/decrement/remove exercises all three cart branches correctly (confirmed with network-aware waits, not fixed delays, after an initial test run gave a misleading read from too-short waits) → payment-method screen → a real Coinos Lightning invoice renders with correct sats conversion and a real QR → cancel returns to payment-method with the cart intact. Zero console errors throughout. Also a clean `tsc` build and a clean production `vite build` (confirmed the wall-art/font precache fix actually took effect by checking the built service worker's precache list).
- **Known gaps, not addressed in this pass:** the 3 real products' thumbnails aren't transparent cutouts the way the design's photo-box expects (pre-existing, already tracked as needing real photography before go-live — see "Before going live" product-photo notes). Real-tablet layout tuning (already an open checklist item) is now more relevant than before, since the whole visual design changed.

## Closing three known gaps (Oct 3, 2026)

Used downtime while the developer provisions a domain to close out three gaps that had been flagged but not fixed, rather than a broad review. All three are verified, not just written.

**Remaining English text in the kiosk, translated.** The dark-theme redesign above translated `PaymentScreen.tsx`/`DoneScreen.tsx`, but missed `App.tsx`'s loading/retry screen and `useKiosk.ts`'s four network-error messages — same inconsistency, different spot. New keys added to `src/lib/strings.ts` (`loading`, `retry`, `errorCatalog`, `errorOrderIncomplete`, `errorLightningUnavailable`, `errorInvoiceFailed`); both files now read `t.*` instead of hardcoded English. The whole kiosk is now consistently Spanish.

**Product catalog script.** `backend/apps/backend/src/scripts/create-armor-gym-products.ts`, following `setup-armor-gym.ts`'s pattern (idempotent — skips any product whose handle already exists). Creates the real 3-product catalogue from nothing: uploads each product's image from `static/` (the files already checked into git from local dev's own uploads: `1790826942502-wpc choc.jpg`, `1790827091758-creatine scoop.jpg`, `1790827204223-banana.jpg`) via `uploadFilesWorkflow`, creates the product with a region-scoped `bob` price (`rules: { region_id }`, per the "region prices only" convention) via `createProductsWorkflow`, then stocks 21 units at the Armor Gym location via `createInventoryLevelsWorkflow`. **Verified for real**, not just type-checked: temporarily deleted the live local Banana product, ran the script, and confirmed the recreated product matched exactly (price, image, and — checked directly against `inventory_item.location_levels` — the stocked quantity). Deleting it surfaced two things worth knowing for next time:
- `deleteProductsWorkflow` already deletes each variant's inventory item itself in this Medusa version (2.21.2); a follow-up manual `inventory.deleteInventoryItems` call (the pattern `remove-demo-data.ts` uses) conflicts with that and rolls back the whole transaction. See the `remove-demo-data.ts` bug note in "Conventions and traps" above.
- `deleteProductsWorkflow` also refuses to delete a product whose inventory item still has open reservations — in this case, stale ones left over from earlier kiosk testing carts today that were never completed. Not a bug, just something to know if a product ever needs deleting with test reservations still outstanding: clear `reservation_item` rows for that `inventory_item_id` via `inventory.deleteReservationItems` first.

Two problems the code review found in this script after it was written (fixed the same day):
- **Where images land.** The upload goes through the file-local provider, which writes to `./static` relative to wherever the script runs, but the deployed server serves `.medusa/server/static`. The local test passed only because `medusa develop` serves `apps/backend/static`, the same folder. On the VM every image would 404. Fix: run the script from `backend/apps/backend` **before** `./scripts/build.sh` (runbook steps 11 then 12); `build.sh` now copies `./static` into the server. If you run it against an already-built server, run `build.sh` again afterwards.
- **A failed run couldn't recover.** Re-runs skipped existing products, so if stocking failed after the products were created, they were never stocked. It now checks every catalogue product on every run and adds any missing stock level at Armor Gym. It never overwrites an existing level, since staff may have changed the count. Verified by removing Banana's level locally: the next run restored just that one, and the run after that did nothing.

**Build script.** `backend/apps/backend/scripts/build.sh` wraps `medusa build` to fix the "every build wipes `.env` and uploaded files" problem noted above. Use it instead of calling `npx medusa build` directly on the VM. What it does (as corrected after the code review, same day):
- **`backend/apps/backend/.env` is the source of truth.** Edit that file, never `.medusa/server/.env`. Every build copies it in fresh. The previous server copy is kept at `.medusa/.build-backup/.env.previous` for rollback, and if anything changed the script prints the *names* of the variables that changed (never their values, since this output can end up in logs). It checks that the source `.env` exists **before** building, because the build wipes the server folder and failing afterwards would leave a server with no config.
- **Uploads survive:** it backs up `.medusa/server/static` (files uploaded through the admin while the server ran) before the build and restores it after. It then also copies `./static` into the server without overwriting anything, so images uploaded by `create-armor-gym-products.ts` (which runs from `apps/backend`) reach the folder the server actually serves.
- Then it runs `npm install` in the fresh `.medusa/server`.

The first version restored the old `.medusa/server/.env` backup in preference to the source `.env`. Edits to the source, like the `https://` `MEDUSA_BACKEND_URL` the domain step needs, would then never have reached the running server, and there would have been no warning. My first test only checked that the backup survived, not that changes got through. **Verified for real (second version):** a missing source `.env` stops the script before `npx` is ever called (tested in a fake app folder). Two real builds locally: the first from nothing, which copied `.env` and the 3 tracked product images; then a fake runtime upload was planted and a dummy variable added to the source `.env`. The second build carried the dummy variable through, named it in the warning, kept `.env.previous` without it, and kept the runtime upload. The source `.env` was restored byte-for-byte afterwards.

## Security review (Oct 3, 2026)

Ran a focused security review (webhook handling, the Coinos payment provider, the kiosk storefront, and this session's new scripts) using a two-pass process: an identification pass against the full project history, then an independent false-positive-filtering pass on each candidate. Two candidates were raised and both scored 2/10 in filtering (threshold for reporting is 8/10) — no reportable findings. The design choice that held up well: the webhook is treated strictly as a trigger to re-check Coinos's live invoice state, never as the source of truth for whether payment happened, which closes off the main class of webhook-forgery bugs. One cheap, not-yet-applied hygiene fix came out of it: swap the webhook secret's `!==` comparison in `service.ts` for a constant-time one (`crypto.timingSafeEqual`) — not a live vulnerability (a leaked secret still can't forge a payment, and extracting it via timing is impractical over a real network), just free defense-in-depth. Noted above as a backburner item to bundle with the plugin refactor.

## Code review fixes (Oct 3, 2026)

Ran `/code-review high backend/apps`. A path target was needed because everything is committed straight to `main` with no remote, so there's no branch diff to review. It raised 10 findings. Each one was confirmed against the code, and against Medusa's installed source where that decided the fix, before anything changed. All 10 are fixed.

**Payment correctness:**
- **Webhook amount in sats recorded as Bs:** see the Coinos provider notes above.
- **Expiry (`useKiosk.ts`):** the kiosk used to compare its own clock to the server's `expires_at`, and checked expiry *before* checking whether the payment had arrived. So a payment in the last seconds, or a tablet clock running ahead, showed "expired" for an invoice that was actually paid. Now the provider also returns `expiry_seconds`, and the kiosk counts down on its own clock from when it received the invoice. After the deadline the QR is hidden and the screen says "Verificando el pago...", and polling continues for a 60-second grace period before the invoice is declared expired.
- **A failed `complete()` stranded a paid member:** polling stopped before `complete()` and any error was swallowed, so a wifi blip at that moment left the QR on screen for good. Now `complete()` is retried on every poll until it succeeds. That's safe because `completeCartWorkflow` is idempotent: if an order already exists for the cart (for example, the webhook got there first), it returns that order (checked in `@medusajs/core-flows`).
- **Leftover invoices stayed payable:** Coinos can't cancel an invoice (see above), and Cancel or Retry used to discard a live one. Now Cancel keeps the invoice and its polling running. Choosing Lightning again with the same total shows the same invoice instead of creating another, and if the old invoice gets paid while the member is on another screen, the kiosk still moves to "done". **Remaining risk, not fixable on our side:** a member scans the QR, taps Cancel, goes back and changes the order, then pays the *old* invoice they already scanned. Medusa has replaced that session by then, so the money reaches Coinos with no order behind it. The daily reconciliation job logs it as an unmatched Coinos payment; refund it manually. It's a narrow window, but it's real for as long as Coinos can't cancel invoices.
- **Errors went to the wrong screen:** payment errors weren't shown on the payment-method screen, and going back to the shop showed the full-screen error, whose Retry clears the cart, including a cart that was already paid. Now errors appear on the payment-method screen, and the full-screen error is used only when the catalogue fails to load.
- **Double taps:** two quick taps created two carts and lost the first item. Cart changes now run one at a time.
- **Reconnect loop:** the auto-retry after a failed catalogue load fired on every failure, so it hammered a backend that was down while the wifi was up. It now fires only when the tablet goes from offline to online.
- Also translated the "Reconnecting..." banner, which the earlier translation pass missed.

**Deploy and ops:** `build.sh` and `create-armor-gym-products.ts` (see their notes above); `lightning-availability` now uses the same Yadio client and rate cache as the provider (`sharedYadioClient`), and reads `YADIO_API_URL` per request, so an unset variable reports Lightning as unavailable instead of crashing the backend at startup.

**Verification:** 23 provider unit tests. One existing test had been asserting the sats-as-amount bug, and was corrected. The kiosk fixes were tested with a headless-browser suite against the local backend, using network interception to force each failure path: a simultaneous double tap, Lightning unavailable, re-selecting Lightning after Cancel, tablet/server clock drift, a payment confirmed after the deadline combined with one failed `complete()`, a paid order that won't complete, and an unpaid invoice expiring only after the grace period. 9/9 pass. One wrinkle: Playwright's own "parallel" clicks share one mouse and interleave, so they can't simulate a double tap. The test fires both taps inside the page in the same tick instead. **Deployed to the VM on Oct 4, 2026** and checked end to end: health, products and images, the availability route, admin, and a real Lightning invoice through the kiosk (new `expiry_seconds` present, invoice reused after Cancel).

**SSH access: why keys kept "stopping working" (diagnosed Oct 4, 2026 from the guest agent and sshd logs).** OS Login is off; that wasn't it. Three separate things happened:
1. A new working environment doesn't have the private half of the key from an earlier one. The deploy-day key worked all morning. The next session simply didn't have it, and nothing changed on the VM.
2. Saving SSH keys in the Console **replaces** the instance's key list. The username comes from the comment at the end of each key line. A key saved with the comment `claude-session` created a separate `claude-session` user, and because that save also dropped the existing `claude` key, the agent stopped managing `claude` (removed its sudo and its Google-written key).
3. A key added by hand to `/home/claude/.ssh/authorized_keys` lasted two minutes. The next metadata change, the Console browser-SSH button's temporary keys expiring, made the agent re-sync, and it cleared `claude`'s keys as an "unused user".

**Rule:** never hand-edit `authorized_keys` on this VM. Add keys through Console → instance → Edit → SSH Keys, with the comment set to the username (`claude`), and keep any existing `claude` line when editing. Any metadata change, including just using the Console's SSH button, triggers a re-sync. Still in metadata, as optional cleanup: a stale `claude-session` entry (same public key, a second sudo user) and two expired browser-SSH keys.

## Slack alerts (Oct 4, 2026)

Kiosk activity goes to one Slack channel, in Spanish:
- **Sales:** order number, items, Bs total, and the Lightning sats amount, with a link to the order in the admin.
- **Low stock:** after a sale, any of its products at **3 or fewer** left, or sold out.
- **Paid but no order:** a confirmed Lightning payment whose cart still has no order 3 minutes later. This is the case where the kiosk shows "call staff", which until now was visible only on the tablet.
- **Reconciliation mismatches** from the daily 06:00 UTC job (02:00 in Bolivia).

**Design.** A custom Medusa notification provider, `src/modules/slack-notification/`, posts to a Slack **incoming webhook**. The message text is built by pure functions in `messages.ts`. Alerts are sent from `src/subscribers/order-placed-slack.ts` (sales and low stock), the new job `src/jobs/alert-paid-without-order.ts` (every 5 minutes), and `src/jobs/reconcile-coinos-payments.ts`, all through `src/lib/notify-slack.ts`. Medusa's docs list Slack as a provider, but it's a tutorial for building your own, and no `@medusajs/notification-slack` package exists. Sending through Medusa's Notification Module instead of calling Slack directly buys two things, both confirmed in the installed module's source:
- Every message is saved (the `notification` table) with its status: pending, success or failure.
- Each send carries an idempotency key (for example `slack:order-placed:<order id>`). A redelivered event or a re-run job doesn't post twice, and a send that failed is retried the next time the same key comes round.

`notify-slack.ts` never throws, so a Slack problem can't affect the sale or job that triggered it. Low stock uses the same availability calculation the Store API uses for the kiosk's "Agotado" label, so Slack and the tablet always agree.

**Configuration.** `SLACK_WEBHOOK_URL` in `backend/apps/backend/.env`, on each machine. It's a secret: never commit it or paste it into chat. The provider is registered in `medusa-config.ts` only when that variable is set, so a machine without it starts normally and sends nothing. Configuring the notification module replaces Medusa's default one, so the default provider (the admin's notification feed) is listed again next to Slack. Outside production (`NODE_ENV` isn't `production`), every message is prefixed with **[prueba]**, so test runs from a dev machine are obvious in the real channel.

**Verified for real**, against the actual Slack channel: a real local sale, paid with Medusa's built-in test payment provider, posted the sale message and a low-stock message ("Banana: quedan 2"), both recorded as `success`. Redelivering the same `order.placed` event posted nothing new. The paid-but-no-order job runs cleanly against the real database (nothing was stuck, so it posted nothing); its selection logic is unit-tested, but it hasn't seen a real stuck payment. 35 unit tests in total. The test orders were cancelled afterwards, and stock is back to where it was.

**The reconciliation job had never worked, and is now fixed.** Running it for real crashed. It assumed `GET /payments` returns a list, but the live API returns `{ payments, count, incoming, outgoing }`. Its unit test mocked a list, the same wrong assumption, so both passed. It also matched on `paymentHash` when the real field is `payment_hash`, and never used `iid` (the Coinos invoice id). Fixed and confirmed against the live API: yesterday's one payment now matches its order. The client also asks for incoming payments only, since outgoing ones (moving funds out of Coinos) can never match an order.

**Expect some false alarms:** local dev and the VM share the same real Coinos account. Any real test payment made through a local backend is a Coinos payment with no order on the VM, so the VM's reconciliation reports it as a mismatch. The first will be Oct 3's local test payment, in the 06:00 UTC run that checks Oct 3. A separate Coinos account for development would stop these.

## Domain and HTTPS (Oct 6, 2026)

Temporary domain `paywithbitcoin.lol`, registered at Porkbun; it will be replaced later. DNS: two A records, the apex and `api`, both pointing at `34.176.250.72`. Porkbun's default parking records (ALIAS/CNAME to `pixie.porkbun.com`) had to be deleted first. `www` still points at the parking page and nothing uses it.

- **Layout:** `https://paywithbitcoin.lol` serves the kiosk (static files in `/var/www/kiosk`). `https://api.paywithbitcoin.lol` proxies to Medusa on `127.0.0.1:9000` (Store API, admin at `/app`, `/hooks` for Coinos, `/static` images). Separate hostnames keep the kiosk's service worker from capturing admin pages, and it means no CORS between kiosk paths and API paths.
- **nginx config:** `deploy/nginx/armor-gym-kiosk.conf` is the plain-HTTP version; certbot edited the installed copy (`/etc/nginx/sites-available/armor-gym-kiosk`) to add TLS and the HTTP→HTTPS redirect. `sw.js`, `workbox-*.js` and `index.html` are served `no-cache` so the tablet picks up new builds.
- **Certificates:** one Let's Encrypt cert for both names, registered without an email, auto-renewed by `certbot.timer` (dry run passed). Expires 2027-01-04 unless renewed.
- **GCP firewall:** the instance has "Allow HTTP/HTTPS traffic" ticked (Console → Edit → Firewalls). Without it, ports 80/443 time out from outside even though nginx is listening.
- **Backend `.env` on the VM:** `MEDUSA_BACKEND_URL=https://api.paywithbitcoin.lol`, `STORE_CORS=https://paywithbitcoin.lol`, `ADMIN_CORS=https://api.paywithbitcoin.lol`, `AUTH_CORS` = both. The pre-change copy is `~/env.backup-2026-10-06`.
- **Kiosk build on the VM:** `backend/apps/kiosk/.env.production` (git-ignored) holds `VITE_MEDUSA_BACKEND_URL` and the VM's own "Armor Gym Kiosk storefront" publishable key. To redeploy: `npm run build` in `backend/apps/kiosk`, then copy `dist/` to `/var/www/kiosk`. Run the workspace-root `npm install` first if kiosk dependencies changed: on Oct 6 it hadn't been re-run since the Oct 4 code update, and the kiosk build failed on the missing `@fontsource/inter`. Alternative that needs no commit (used Oct 6): build locally with `VITE_MEDUSA_BACKEND_URL` and `VITE_MEDUSA_PUBLISHABLE_KEY` exported in the shell (they override the local `.env`), `--outDir` outside the repo, then stream it over with `tar` and swap it into `/var/www/kiosk`. The previous build is kept at `/var/www/kiosk.prev` for rollback.
- **Stored URLs don't follow the domain:** image URLs are saved in full at upload time (`product.thumbnail`, `image.url`), so the 3 products uploaded under the IP pointed at `http://34.176.250.72:9000` and were blocked as mixed content on the HTTPS kiosk. Fixed Oct 6 with a one-transaction SQL `replace()` of the old prefix in `product.thumbnail` and `image.url`; a headless-browser check then showed all images loading and zero console errors. Changing the domain later means rewriting those again, along with the nginx `server_name`s, certbot, both `.env` files, and a rebuild of both apps.
- **Vite version note:** both the VM and local dev actually resolve Vite 7.3.6 for the kiosk, despite the `^6.3.5` pin in its package.json. It builds and runs fine; the pin isn't doing what the Vite-8 gotcha note above assumes.

## Faster payment confirmation (Oct 6, 2026)

The first real payment through the deployed webhook took ~7 s from Coinos's webhook arriving to the order existing. The logs showed why: Medusa's `/hooks/payment/:provider` route holds every webhook for 5 s before processing it (`delay: options.webhook_delay || 5000`), then the kiosk could take up to 3 s more to notice.

- **`webhook_delay` can't be set by config in 2.21.2.** The route reads it from the payment module's `options`, which the module never exposes (checked at runtime with a throwaway `medusa exec` script: always `undefined`). Setting it in `medusa-config.ts` silently does nothing. Also note `0` would fall back to 5000 anyway.
- **Fix:** our own route, `src/api/hooks/coinos/route.ts` (`POST /hooks/coinos`), which emits the same `payment.webhook_received` event as Medusa's route but with a 100 ms delay; `middlewares.ts` gives it the same `preserveRawBody` setting. The provider now registers that URL on new invoices. Medusa's own route stays, so invoices created before the change still confirm (with the old 5 s delay).
- **Why 100 ms is safe:** the delay exists to avoid a race with cart completion, but in this version `processPaymentWorkflow` and `completeCartWorkflow` both take a lock on the cart id (Redis locking on the VM).
- **Kiosk polling** went from 3 s to 0.5 s, with a guard so a slow tick makes the next one skip instead of overlapping.
- **Measured with a real payment (order #2, Bs 1):** webhook arrived → processing started 0.19 s later → the kiosk saw the payment confirmed ~1.3 s after that → order done 2.7 s after the webhook arrived (was ~7.2 s for order #1). What's left is mostly Medusa's own work: ~1 s for `processPaymentWorkflow` (it re-checks the invoice with Coinos before marking it paid) and ~0.7 s for `complete()`. Neither is worth trimming further.
