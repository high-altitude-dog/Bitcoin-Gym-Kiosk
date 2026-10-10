# Bitcoin Gym Kiosk

A self-service kiosk for gyms. Members pick drinks, snacks and supplements on a wall-mounted tablet and pay from
their own phone with **Bitcoin Lightning** or a **bank QR in bolivianos (Bs)**. Lightning invoices are created and
confirmed through [CoinOS.io](https://coinos.io) and its [API](https://coinos.io/docs). A sale is complete only when
the payment provider confirms it. **Ark**, through [Second](https://second.tech), will shortly be added as an additional
payment method.

It is built on [MedusaJS](https://medusajs.com). It is designed so that adding more gyms later means a new stock
location and a new tablet, not a redesign.

## How it works

```text
 Tablet kiosk (React)  ──┐                         ┌─▶ Yadio       BOB/BTC rate when a Lightning invoice is made
                         ├─▶  Medusa backend  ─────┼─▶ Coinos      Lightning invoices, payment webhook
 Medusa admin (staff)  ──┘    Postgres + Redis     ├─▶ Baneco API  bank QR in Bs (not connected yet)
                                                   └─▶ Slack       sales, low stock, payment alerts
```

1. The member taps products on the tablet; Medusa builds the cart in Bs against the gym's stock.
2. They choose **Bitcoin⚡** or **bank QR**. For Lightning, the backend converts the Bs total to sats at the current
   Yadio rate and creates a short-lived invoice at Coinos; the tablet shows it as a QR code with a countdown.
3. The member pays from any Lightning wallet. Coinos calls the backend's webhook, the backend re-checks the invoice
   with Coinos, and only then does Medusa create the order and reserve stock. The tablet shows "¡Gracias!" with the
   order number and what to take.
4. Self-serve items are fulfilled automatically; items handed over by staff or brought by a partner café are posted to
   their own Slack channels.

Prices are always set and shown in Bs; sats are worked out only when an invoice is created, and the rate and amount
are stored on the order. A daily job reconciles Coinos's payment history against Medusa's orders.

## What's in the repo

```text
backend/                      Turborepo workspace (npm)
├── apps/backend/             Medusa 2 application
│   └── src/
│       ├── modules/coinos-lightning/      Payment provider: Lightning via Coinos, rates from Yadio
│       ├── modules/slack-notification/    Notification provider posting to Slack incoming webhooks
│       ├── api/hooks/coinos/              Fast webhook route for Coinos payment confirmations
│       ├── api/store/lightning-availability/  Tells the kiosk whether Lightning can be offered right now
│       ├── jobs/                          Daily Coinos reconciliation, "paid but no order" alert
│       ├── subscribers/                   Fulfilment by product type, Slack alerts, product housekeeping
│       └── scripts/                       Setup and catalogue scripts (`npx medusa exec ./src/scripts/<name>.ts`)
└── apps/kiosk/               Tablet storefront: Vite + React + TypeScript, Medusa JS SDK
    ├── src/                  Screens, kiosk state machine (state/useKiosk.ts), design tokens
    └── tests/e2e/            Playwright end-to-end suites against a mocked Store API
deploy/
├── nginx/                    nginx site config (kiosk at the apex, Medusa at api.)
└── backup/                   Nightly pg_dump + uploaded images, as a systemd service and timer
docs/                         Specs for planned features
```

`CLAUDE.md` is the detailed project log: design decisions, the deployment runbook, gotchas found along the way, and
the open checklist. Read it before changing payments or deploying.

## The kiosk app

- Designed for an 11" Android tablet (1200 × 1920) running in Fully Kiosk Browser. It works **in portrait and in
  landscape**, and members can turn the tablet at any time: the layout changes without losing the cart, a live
  invoice or the place in the product list.
- Spanish (Bolivia) UI, dark theme ("Kiosko Byte, La Paz") with Byte, [Second](https://second.tech)'s mascot, used
  with permission.
- Built for an unattended device: instant feedback on every tap, a 60-second idle reset (paused while a payment is
  in progress), an offline-capable app shell, automatic retries when the backend can't be reached, and a "tell a
  staff member" screen if a paid order can't be completed.

## Running it locally

**You need:** Node.js 20.19+ (or 22.12+), PostgreSQL 15+ and Redis (Postgres 17 and Redis 8 are used in
development), and a [Coinos](https://coinos.io) account for real Lightning invoices.

```bash
cd backend
npm install

# Backend configuration: copy the template and fill it in (database, secrets, Coinos, Slack)
cp apps/backend/.env.template apps/backend/.env

cd apps/backend
npx medusa db:migrate
npx medusa user -e <your-email> -p <a-password>      # admin login
npx medusa exec ./src/scripts/setup-armor-gym.ts     # region, stock location, sales channel, publishable key
npx medusa exec ./src/scripts/create-armor-gym-products.ts
npx medusa exec ./src/scripts/remove-demo-data.ts    # removes the Medusa starter's demo data
npx medusa develop                                   # http://localhost:9000, admin at /app
```

`setup-armor-gym.ts` prints the kiosk's publishable key. Put it in the kiosk's environment and start the kiosk:

```bash
cd backend/apps/kiosk
cp .env.example .env        # VITE_MEDUSA_BACKEND_URL and VITE_MEDUSA_PUBLISHABLE_KEY
npx vite --port 5173        # http://localhost:5173
```

Notes:

- **Credentials live only in `.env` files**, which are git-ignored. Never commit them. See the comments in
  `.env.example` for what each variable is and where to get it; Yadio needs no key, and the Coinos webhook secret is
  one you generate yourself.
- **Coinos can't reach `localhost`.** A paid invoice won't be confirmed by webhook on a local backend unless you
  expose it (for example with ngrok). Completing the cart re-checks Coinos directly, so local testing still works.
- The setup scripts are idempotent and safe to re-run. Their names reflect the gym this instance was built for;
  change the names and catalogue for another gym.

## Tests

```bash
cd backend/apps/backend && npm run test:unit   # payment provider, Coinos/Yadio clients, jobs, product rules, Slack
cd backend/apps/kiosk && npm run test:e2e      # kiosk in portrait and landscape, ~80 s
```

The kiosk suites build the app and drive it in headless Chromium against a mock of the Store API, so they need no
backend. They need a Chromium (`npx playwright install chromium`); see `backend/apps/kiosk/tests/e2e/README.md`.

## Deployment

The pilot runs on a single Google Cloud VM (Debian, e2-medium) with Medusa, Postgres and Redis, behind nginx and
Let's Encrypt. The kiosk is served as static files; Medusa runs as a systemd service. Updates are pulled from this
repo with a read-only deploy key. Backups run nightly, plus a daily disk snapshot.

The full runbook, including the traps (Medusa's build wiping uploads and `.env`, image URLs that don't follow a
domain change, SSH key handling on GCP), is in `CLAUDE.md` under "Deploying to the VM", "Domain and HTTPS" and
"Database backups". Use `backend/apps/backend/scripts/build.sh` rather than `medusa build` directly.

## Status

Working: Lightning payments end to end on the deployed backend, the kiosk in both orientations, automatic
fulfilment for self-serve items, Slack alerts, reconciliation and backups.

Coming shortly: **Ark payments through [Second](https://second.tech)**, as an additional payment method alongside
Lightning and bank QR. A coin toss will determine whether to route the payment through CoinOS or second.tech,
failing-over to each other.

Not done yet: the Baneco bank QR (waiting on API access from the bank; the kiosk has a placeholder with a manual
"Pagado" button for now), partner café items, and multi-gym features, which wait until a second gym exists. The
open checklist is in `CLAUDE.md`.

## Acknowledgements

Thank you to [Second](https://second.tech) for **Byte**, their mascot, who appears throughout the kiosk: on the
start-screen and shop walls, jumping rope while the kiosk reconnects, through the hoops while an invoice is made,
with a banana while the order is empty, and with a bone on "¡Gracias!". Byte's artwork and animations are used with
Second's kind permission and remain theirs (see [NOTICE.md](NOTICE.md)).

## License

[MIT](LICENSE), for the code and documentation. The artwork (Byte, Second's mascot, used with permission, and the wall
images that include him), the Lightning logo and the product photos are **not** covered: see [NOTICE.md](NOTICE.md).
The backend was started from Medusa's [DTC starter](https://docs.medusajs.com), which is also MIT-licensed
(`backend/LICENSE`).
