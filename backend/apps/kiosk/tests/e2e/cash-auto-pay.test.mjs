// The cash screen lists the order and counts down 5 minutes; with no tap it places the order, has it
// recorded as paid (auto-capture) and goes back to the start screen. The 60 s idle reset stays off.
import { createChecker, createMock, launch, LANDSCAPE, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

async function toCashScreen(page) {
  await page.goto(server.url)
  await page.clock.resume()
  await page.waitForSelector(".k-idle")
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => { const adds = document.querySelectorAll(".k-card .k-add"); adds[0].click(); adds[1].click() })
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelectorAll(".k-card .k-stepper__plus")[0].click())
  await page.waitForTimeout(1500)
  await page.click(".k-bar .k-pay")
  await page.waitForSelector(".k-method")
  await page.click(".k-method__option--cash")
  await page.waitForSelector(".cash-items")
}
const calls = (mock, re) => mock.calls.filter((c) => re.test(c)).length

// ---- A. nobody taps: after 5 minutes the order is placed, captured, and the kiosk starts over
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  const errors = watchErrors(page)
  await page.clock.install()
  await toCashScreen(page)
  const lines = await page.evaluate(() => [...document.querySelectorAll(".cash-items .done-item")].map((l) => l.querySelector(".done-item__qty").textContent + " " + l.querySelector(".done-item__name").textContent))
  check("A: the cash screen lists the order (2 lines, with quantities)", lines.length === 2 && lines[0].startsWith("2×") && lines[1].startsWith("1×"), lines.join(" | "))
  check("A: the countdown starts at 5:00", /se dará por pagado en (5:00|4:59)/.test(await page.textContent(".cash-countdown")), await page.textContent(".cash-countdown"))
  await page.screenshot({ path: `${SHOTS}/cash-confirm-items-portrait.png` })
  await page.setViewportSize(LANDSCAPE)
  await page.waitForTimeout(400)
  const fits = await page.evaluate(() => { const st = document.querySelector(".k-stage").getBoundingClientRect(); return [...document.querySelectorAll(".bank-qr-actions button, .cash-countdown, .cash-items")].every((e) => { const r = e.getBoundingClientRect(); return r.top >= st.top && r.bottom <= st.bottom }) })
  check("A: in landscape the list, countdown and buttons stay on the stage", fits)
  await page.screenshot({ path: `${SHOTS}/cash-confirm-items-landscape.png` })
  await page.setViewportSize(PORTRAIT)
  await page.clock.fastForward(120_000)
  check("A: after 2 minutes the cash screen is still up (no 60 s idle reset)", !!(await page.$(".cash-items")))
  check("A: and the countdown shows about 3:00", /(3:00|2:59)/.test(await page.textContent(".cash-countdown")), await page.textContent(".cash-countdown"))
  check("A: no order placed yet", calls(mock, /complete$/) === 0)
  await page.clock.fastForward(181_000)
  const idle = await page.waitForSelector(".k-idle", { timeout: 5000 }).then(() => true, () => false)
  check("A: at 5 minutes the kiosk is back on the start screen", idle)
  check("A: one cash session, one order, one auto-capture", JSON.stringify(mock.sessionProviders) === '["pp_cash_cash"]' && calls(mock, /complete$/) === 1 && calls(mock, /^POST \/store\/cash-orders\/order_1\/auto-capture$/) === 1,
    JSON.stringify({ sessions: mock.sessionProviders, complete: calls(mock, /complete$/), capture: calls(mock, /auto-capture/) }))
  check("A: the desk was told to collect once, and never told to cancel", mock.cashDesk.length === 1 && mock.cashDesk[0].cancelled === false && /^\d+$/.test(mock.cashDesk[0].attempt), JSON.stringify(mock.cashDesk))
  check("A: no page errors", errors.length === 0, errors.join(" | "))
  await ctx.close()
}

// ---- B. "Confirmar pedido" tapped: the usual done screen, and nothing happens at 5 minutes
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  await page.clock.install()
  await toCashScreen(page)
  await page.click(".bank-qr-paid")
  await page.waitForSelector(".done-title")
  await page.clock.fastForward(310_000)
  check("B: confirmed by hand: no auto-capture later", calls(mock, /auto-capture/) === 0 && calls(mock, /complete$/) === 1)
  check("B: the desk was told to collect once, no cancel", mock.cashDesk.length === 1 && mock.cashDesk[0].cancelled === false, JSON.stringify(mock.cashDesk))
  await ctx.close()
}

// ---- C. "Cancelar" tapped: back to the payment choice, and nothing happens at 5 minutes
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  await page.clock.install()
  await toCashScreen(page)
  await page.click(".bank-qr-cancel")
  await page.waitForSelector(".k-method")
  await page.clock.fastForward(310_000)
  check("C: cancelled: no order and no auto-capture", calls(mock, /auto-capture/) === 0 && calls(mock, /complete$/) === 0)
  check("C: 'cobrar' then 'no cobrar' for the same opening", mock.cashDesk.length === 2 && !mock.cashDesk[0].cancelled && mock.cashDesk[1].cancelled === true && mock.cashDesk[0].attempt === mock.cashDesk[1].attempt, JSON.stringify(mock.cashDesk))
  await ctx.close()
}

// ---- D. "Cancelar" before the cart is ready: the desk is told nothing at all
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  await page.goto(server.url)
  await page.waitForSelector(".k-idle")
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
  await page.waitForTimeout(1500)
  await page.click(".k-bar .k-pay")
  await page.waitForSelector(".k-method")
  mock.shippingDelay = 1500
  await page.click(".k-method__option--cash")
  await page.waitForSelector(".bank-qr-cancel")
  await page.click(".bank-qr-cancel")
  await page.waitForSelector(".k-method")
  await page.waitForTimeout(2500)
  check("D: cancelled before the cart was ready: no message to the desk", mock.cashDesk.length === 0, JSON.stringify(mock.cashDesk))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
