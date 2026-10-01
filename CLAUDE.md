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
- [ ] Set up the local machine: VS Code, Node.js 20 or newer, PostgreSQL, Claude Code
- [ ] Set up Medusa locally: the Bolivia region in BOB, this gym's stock location, the real product list
- [ ] Build the Coinos payment provider with Yadio rates
- [ ] Build the kiosk storefront for the tablet
- [ ] Create the VM with a swap file and deploy for the pilot
- [ ] Pilot with Lightning only, then add the Baneco provider when credentials arrive
- [ ] Set the Coinos auto-sweep threshold
