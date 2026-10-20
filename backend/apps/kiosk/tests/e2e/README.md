# Kiosk end-to-end tests

Headless Chromium (Playwright) driving the built kiosk against a mock of the Store API, so no backend, database or
Coinos is needed and nothing real is touched. They check layout and behaviour in portrait and landscape and while
turning the tablet. They don't replace trying the kiosk on the Megapad.

```bash
cd backend/apps/kiosk
npm run test:e2e              # build once, run every suite (about 80 s)
npm run test:e2e -- rotation  # only suites whose file name contains "rotation"
```

- `shop-landscape.test.mjs`: the shop in landscape (4 columns, the order panel, the fade and chevrons) and a turn with a cart.
- `manual-prep.test.mjs`: bank QR and cash screens show at once while the cart is made ready behind them; confirming early waits for it.
- `screens.test.mjs`: payment method, invoice wait, Lightning QR, bank QR, "¡Gracias!" and the connection error, in both orientations.
- `cash-auto-pay.test.mjs`: the cash screen's item list and 5-minute countdown; with no tap the order is placed and auto-captured, and the kiosk starts over (fake clock).
- `connect.test.mjs`: the faint Wi-Fi button on the start screen (over the wall's arrow) and the Wi-Fi and gym-access QR screen, both orientations.
- `exit-button.test.mjs`: the faint back-to-start button at the top right of the shop (both orientations), which clears the cart.
- `lightning-confirmed.test.mjs`: a confirmed payment shows "¡Pago recibido!" at once and the order once it exists, including a failed first attempt.
- `shop-order.test.mjs`: sold-out products last, in "Todo" and inside a category, and only from the next member's start.
- `rotation-stress.test.mjs`: turning during taps, saving, a live invoice, a payment and the idle timer.
- `support.mjs`: the static server, Chromium launcher, mock Store API and reporter the suites share.

Needs a Chromium: `npx playwright install chromium`, or set `CHROMIUM_PATH` (a Chromium in `~/.cache/ms-playwright` is
found automatically). Screenshots are written to `E2E_SHOTS` (default: a folder in the system temp directory). The
suites are dev-only: the VM never runs them, and `playwright-core` downloads no browser.
