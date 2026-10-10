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
- `screens.test.mjs`: payment method, invoice wait, Lightning QR, bank QR, "¡Gracias!" and the connection error, in both orientations.
- `rotation-stress.test.mjs`: turning during taps, saving, a live invoice, a payment and the idle timer.
- `support.mjs`: the static server, Chromium launcher, mock Store API and reporter the suites share.

Needs a Chromium: `npx playwright install chromium`, or set `CHROMIUM_PATH` (a Chromium in `~/.cache/ms-playwright` is
found automatically). Screenshots are written to `E2E_SHOTS` (default: a folder in the system temp directory). The
suites are dev-only: the VM never runs them, and `playwright-core` downloads no browser.
