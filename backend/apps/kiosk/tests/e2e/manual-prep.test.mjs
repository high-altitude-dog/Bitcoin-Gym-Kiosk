// Bank QR and cash screens show at once; the cart is made ready (pickup shipping) behind them, and
// "Pagado" tapped before that waits for it and still places exactly one order.
import { createChecker, createMock, launch, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()
const count = (mock, re) => mock.calls.filter((c) => re.test(c)).length

async function toPaymentChoice(page) {
  await page.goto(server.url)
  await page.waitForSelector(".k-idle")
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
  await page.waitForTimeout(1500)
  await page.click(".k-bar .k-pay")
  await page.waitForSelector(".k-method")
}

for (const [method, button, screenSel, confirm] of [
  ["bank QR", ".k-method__option--bank-qr", ".payment-qr--bank", ".bank-qr-paid"],
  ["cash", ".k-method__option--cash", ".cash-items", ".bank-qr-paid"],
]) {
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  const errors = watchErrors(page)
  await toPaymentChoice(page)
  mock.shippingDelay = 1500
  const t0 = Date.now()
  await page.click(button)
  await page.waitForSelector(screenSel)
  const shownAfter = Date.now() - t0
  check(`${method}: the screen shows at once while shipping takes 1.5 s`, shownAfter < 500, `${shownAfter} ms`)
  // Tap the confirm button straight away, before the cart is ready.
  await page.click(confirm)
  await page.waitForSelector(".done-title", { timeout: 8000 })
  check(`${method}: confirming early waited for the cart, then placed one order`,
    count(mock, /shipping-methods$/) === 1 && count(mock, /payment-sessions$/) === 1 && count(mock, /complete$/) === 1,
    JSON.stringify({ shipping: count(mock, /shipping-methods$/), sessions: count(mock, /payment-sessions$/), complete: count(mock, /complete$/) }))
  const order = mock.calls.indexOf(mock.calls.find((c) => /POST .*shipping-methods$/.test(c))) < mock.calls.indexOf(mock.calls.find((c) => /payment-sessions$/.test(c)))
  check(`${method}: shipping was attached before the payment session`, order)
  check(`${method}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
