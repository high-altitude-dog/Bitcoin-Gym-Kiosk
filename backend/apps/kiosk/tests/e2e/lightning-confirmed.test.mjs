// A confirmed Lightning payment shows "¡Pago recibido!" at once, then fills in the order once it exists.
import { createChecker, createMock, launch, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
await mock.install(page)
const errors = watchErrors(page)
const { check, finish } = createChecker()
const completes = () => mock.calls.filter((c) => c === "POST /store/carts/cart_1/complete").length

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
await page.waitForSelector(".k-stepper")
await page.waitForTimeout(1200)
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await page.click(".k-method__option >> nth=0")
await page.waitForSelector(".payment-qr", { timeout: 10000 })

// The order takes 2.5 s to create, and the first attempt fails.
mock.orderItems = [{ id: "i1", quantity: 1, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
mock.completeDelay = 1200
mock.completeFailures = 1
const paidAt = Date.now()
mock.paid = true
await page.waitForSelector(".done-title")
const shownAfter = Date.now() - paidAt
const early = await page.evaluate(() => ({
  title: document.querySelector(".done-title").textContent,
  number: document.querySelector(".done-order__number").textContent,
  button: !!document.querySelector(".done-new"),
  list: !!document.querySelector(".done-items"),
  art: !!document.querySelector(".done-art"),
}))
await page.evaluate(() => { document.querySelector(".done-art").__tag = "same" })
check("payment confirmed: the done screen shows within one poll, before the order exists", shownAfter < 1000, `${shownAfter} ms`)
check("it says '¡Pago recibido!' with '#…', Byte, and no list or 'Nuevo pedido' yet",
  early.title === "¡Pago recibido!" && early.number === "#…" && early.art && !early.button && !early.list, JSON.stringify(early))

// The idle timer must not reset it while waiting (the member has paid).
await page.waitForSelector(".done-new", { timeout: 10000 })
const late = await page.evaluate(() => ({
  title: document.querySelector(".done-title").textContent,
  number: document.querySelector(".done-order__number").textContent,
  list: document.querySelectorAll(".done-item").length,
  sameArt: document.querySelector(".done-art").__tag === "same",
}))
check("after a failed attempt, the order fills in: '¡Gracias!', #12, the list and the button", late.title === "¡Gracias!" && late.number === "#12" && late.list === 1, JSON.stringify(late))
check("Byte's video kept playing (same element)", late.sameArt)
await page.waitForTimeout(1500)
check("completion was retried once after the failure and not called again", completes() === 2, `${completes()} calls`)

// The one 500 is the failed completion this test injects on purpose.
const unexpected = errors.filter((e) => !/status of 500/.test(e))
check("no page errors besides the injected 500", unexpected.length === 0 && errors.length === 1, errors.join(" | "))
await browser.close()
await server.close()
finish()
