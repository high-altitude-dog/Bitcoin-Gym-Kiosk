// Creating an invoice may take up to 15 s (INVOICE_TIMEOUT_MS) before the kiosk gives up;
// every other request still gives up after 10 s.
import { createChecker, createMock, launch, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const toInvoice = async (page) => {
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-bar .k-pay")
  await page.waitForSelector(".k-method")
  await page.click(".k-method__option >> nth=0")
}

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.sessionDelay = 12_000
  await mock.install(page)
  const errors = watchErrors(page)
  await toInvoice(page)
  const shown = await page.waitForSelector(".payment-qr", { timeout: 20_000 }).then(() => true, () => false)
  check("an invoice that takes 12 s still shows its QR", shown && !(await page.$(".k-method__error")))
  check("no page errors", errors.length === 0, errors.join(" | "))
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.sessionDelay = 17_000
  await mock.install(page)
  await toInvoice(page)
  const started = Date.now()
  await page.waitForSelector(".k-method__error", { timeout: 25_000 })
  const after = (Date.now() - started) / 1000
  check("one that takes 17 s gives up at about 15 s, back on the payment choice with the error", after > 13 && after < 17.5 && !(await page.$(".payment-qr")), `${after.toFixed(1)} s`)
  await ctx.close()
}

await browser.close()
await server.close()
finish()
