// Shared pieces for the end-to-end suites: a static server for the built kiosk,
// a Chromium launcher, a mock of the Medusa Store API (every request to API is
// answered by the test, so no backend is needed), and a pass/fail reporter.
import { chromium } from "playwright-core"
import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// The kiosk is built against this address (see run.mjs); every request to it
// is intercepted by the mock below, so the host doesn't have to exist.
export const API = "http://kiosk-mock.test:9000"
export const PORTRAIT = { width: 1200, height: 1920 }
export const LANDSCAPE = { width: 1920, height: 1200 }
export const LIGHTNING_PROVIDER = "pp_coinos-lightning_coinos-lightning"
export const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }

// Screenshots go here when a suite takes them. Set E2E_SHOTS to keep them somewhere.
export const SHOTS = process.env.E2E_SHOTS || path.join(os.tmpdir(), "kiosk-e2e-shots")
fs.mkdirSync(SHOTS, { recursive: true })

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".webm": "video/webm", ".json": "application/json" }

/** Serves the built kiosk (KIOSK_DIST) on a free port. */
export async function startServer() {
  const dist = process.env.KIOSK_DIST
  if (!dist) throw new Error("KIOSK_DIST is not set: run the suites with `npm run test:e2e`")
  const server = http.createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname))
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html")
    res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream")
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** Playwright's own Chromium if it is installed, else any in the usual cache (CHROMIUM_PATH overrides). */
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const own = chromium.executablePath()
  if (fs.existsSync(own)) return own
  const cache = path.join(os.homedir(), ".cache", "ms-playwright")
  const found = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((d) => d.startsWith("chromium-")).sort().reverse().map((d) => path.join(cache, d, "chrome-linux64", "chrome")).find((p) => fs.existsSync(p))
    : undefined
  if (!found) throw new Error("No Chromium found. Run `npx playwright install chromium`, or set CHROMIUM_PATH.")
  return found
}

export const launch = () => chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] })

/** Page errors and console errors, collected. */
export function watchErrors(page) {
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  return errors
}

export function createChecker() {
  const results = []
  return {
    check(name, ok, extra = "") {
      results.push(ok)
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`)
    },
    finish() {
      const ok = results.every(Boolean)
      console.log(ok ? `\nALL PASS (${results.length})` : `\nSOME FAILED (${results.filter((r) => !r).length} of ${results.length})`)
      process.exitCode = ok ? 0 : 1
    },
  }
}

const NAMES = ["Whey Protein Concentrate - Chocolate", "Creatine Monohydrate", "Banana", "Qkies Galetta", "Fruit Drink",
  "Whey Protein Isolate Chocolate", "Mio Acai", "Mio Limonada", "Pre-workout Fresa 300g", "Pre-workout Fruta 300g",
  "Aventura", "Barra de proteína", "Agua 500ml", "Isotónico", "Cafe", "Galleta"]

/**
 * A mock of the Store API calls the kiosk makes, with a cart that really holds
 * lines. Tests change its fields as they go:
 *   cartDelay          ms each cart change takes (to leave taps unsent)
 *   availabilityDelay  ms the Lightning availability check takes
 *   paid               the Lightning payment session reads as authorized
 *   orderItems         the lines the completed order returns
 *   sessionProviders   provider ids of the payment sessions created, in order
 *   categories         the product categories the store lists
 * and read cart and calls (every request, as "METHOD /path").
 */
export function createMock() {
  const mock = {
    products: NAMES.map((title, i) => ({
      id: `prod_${i}`, title, thumbnail: null, categories: [],
      variants: [{ id: `var_${i}`, inventory_quantity: 20, calculated_price: { calculated_amount: 1 + (i % 5) } }],
    })),
    cart: null,
    calls: [],
    cartDelay: 0,
    availabilityDelay: 0,
    paid: false,
    orderItems: [],
    sessionProviders: [],
    categories: [],
    /** Answers every request to API from this page or context. */
    install(target) {
      return target.route(`${API}/**`, async (route) => {
        const req = route.request()
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors })
        const url = new URL(req.url())
        const json = (body) => route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) })
        mock.calls.push(`${req.method()} ${url.pathname}`)
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        if (/line-items/.test(url.pathname) && req.method() !== "GET" && mock.cartDelay) await wait(mock.cartDelay)
        const price = (variantId) => mock.products.find((p) => p.variants[0].id === variantId).variants[0].calculated_price.calculated_amount
        const recalc = () => { mock.cart = { ...mock.cart, total: mock.cart.items.reduce((sum, i) => sum + price(i.variant_id) * i.quantity, 0) } }
        const body = () => JSON.parse(req.postData() ?? "{}")

        if (url.pathname === "/store/regions") return json({ regions: [{ id: "reg_1", currency_code: "bob" }] })
        if (url.pathname === "/store/products") return json({ products: mock.products, count: mock.products.length })
        if (url.pathname === "/store/product-categories") return json({ product_categories: mock.categories })
        if (url.pathname === "/store/carts" && req.method() === "POST") { mock.cart = { id: "cart_1", total: 0, items: [] }; return json({ cart: mock.cart }) }
        if (url.pathname.endsWith("/line-items") && req.method() === "POST") {
          mock.cart = { ...mock.cart, items: [...mock.cart.items, { id: `li_${body().variant_id}`, variant_id: body().variant_id, quantity: body().quantity }] }
          recalc()
          return json({ cart: mock.cart })
        }
        const line = url.pathname.match(/\/line-items\/(li_[^/]+)$/)
        if (line && req.method() === "POST") {
          mock.cart = { ...mock.cart, items: mock.cart.items.map((i) => (i.id === line[1] ? { ...i, quantity: body().quantity } : i)) }
          recalc()
          return json({ cart: mock.cart })
        }
        if (line && req.method() === "DELETE") {
          mock.cart = { ...mock.cart, items: mock.cart.items.filter((i) => i.id !== line[1]) }
          recalc()
          return json({ parent: mock.cart })
        }
        if (url.pathname === "/store/lightning-availability") { await wait(mock.availabilityDelay); return json({ available: true }) }
        if (url.pathname === "/store/shipping-options") return json({ shipping_options: [{ id: "so_1" }] })
        if (url.pathname.endsWith("/shipping-methods")) { mock.cart = { ...mock.cart, shipping_methods: [{ id: "sm_1" }] }; return json({ cart: mock.cart }) }
        if (url.pathname === "/store/payment-collections") { mock.cart = { ...mock.cart, payment_collection: { id: "pc_1", payment_sessions: [] } }; return json({ payment_collection: mock.cart.payment_collection }) }
        if (url.pathname.endsWith("/payment-sessions")) {
          const isLightning = body().provider_id === LIGHTNING_PROVIDER
          mock.sessionProviders.push(body().provider_id)
          const data = isLightning ? { bolt11: "lnbc5880n1" + "q".repeat(280), sats_amount: 588, bob_amount: 6, expiry_seconds: 600 } : {}
          return json({ payment_collection: { id: "pc_1", payment_sessions: [{ id: "ps_1", provider_id: body().provider_id, status: "pending", data }] } })
        }
        if (url.pathname.endsWith("/complete")) return json({ type: "order", order: { id: "order_1", display_id: 12, total: mock.cart?.total ?? 0, items: mock.orderItems } })
        if (url.pathname.startsWith("/store/carts/")) {
          if (mock.cart?.payment_collection) {
            mock.cart = { ...mock.cart, payment_collection: { id: "pc_1", payment_sessions: [{ id: "ps_1", provider_id: LIGHTNING_PROVIDER, status: mock.paid ? "authorized" : "pending", data: {} }] } }
          }
          return json({ cart: mock.cart })
        }
        return json({})
      })
    },
  }
  return mock
}
