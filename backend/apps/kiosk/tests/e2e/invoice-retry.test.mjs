// An invoice request that fails fast (Coinos down: 530 in 200 ms) is tried again
// while the invoice deadline allows, with the coinos.io portrait going red on
// each failure and amber again for the next try (Nov 3, 2026).
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
const coinos = (page) => page.evaluate(() => document.querySelector('.invoice-light[data-service="coinos"]')?.getAttribute("data-light"))

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.sessionFailures = 2
  await mock.install(page)
  const errors = watchErrors(page)
  await toInvoice(page)
  const seen = []
  const spans = []
  const until = Date.now() + 9000
  let last = null
  while (Date.now() < until && !(await page.$(".payment-qr"))) {
    const c = await coinos(page)
    const now = Date.now()
    if (c && last?.c !== c) { if (last) spans.push({ c: last.c, ms: now - last.at }); seen.push(c); last = { c, at: now } }
    await page.waitForTimeout(40)
  }
  check("two failed tries, then the QR", !!(await page.$(".payment-qr")) && !(await page.$(".k-method__error")))
  check("the coinos.io light went red and amber again between tries", seen.join(">").includes("red>amber>red") || seen.join(">").includes("amber>red>amber"), seen.join(">"))
  // An amber that ends in red (a failed try); the last one ends in the QR.
  const amberAfter = spans.filter((x, i) => x.c === "amber" && i > 0 && spans[i + 1]?.c === "red")
  const redBetween = spans.filter((x) => x.c === "red").slice(-2)
  check("each retry's amber and red last long enough to see (amber over 700 ms, red over 1.2 s)", amberAfter.length >= 1 && amberAfter.every((x) => x.ms > 700) && redBetween.length >= 1 && redBetween.every((x) => x.ms > 1200), JSON.stringify(spans))
  check("three invoice requests in all", mock.calls.filter((c) => c.endsWith("/payment-sessions")).length === 3, mock.calls.filter((c) => c.endsWith("/payment-sessions")).length)
  const real = errors.filter((e) => !e.includes("status of 500"))
  check("no page errors (the mock's own 500s aside)", real.length === 0, real.join(" | "))
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.sessionFailures = 1000
  await mock.install(page)
  await toInvoice(page)
  const started = Date.now()
  await page.waitForSelector(".k-method__error", { timeout: 20_000 })
  const after = (Date.now() - started) / 1000
  const tries = mock.calls.filter((c) => c.endsWith("/payment-sessions")).length
  check("a service that stays down: several tries, then the error, within the 15 s limit", tries >= 3 && after > 5 && after < 15, `${tries} tries, ${after.toFixed(1)} s`)
  await ctx.close()
}

await browser.close()
await server.close()
finish()
