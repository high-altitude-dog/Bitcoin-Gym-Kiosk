// Turning the tablet at awkward moments: during taps, saving, a live invoice, a payment, and the idle timer.
import { createChecker, createMock, launch, LANDSCAPE, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
await mock.install(page)
const errors = watchErrors(page)
const { check, finish } = createChecker()

const LAND = LANDSCAPE, PORT = PORTRAIT
const turn = (to) => page.setViewportSize(to)
const orient = () => page.evaluate(() => document.querySelector(".k-stage").dataset.orientation)
const shownQty = () => page.evaluate(() => { const c = document.querySelector(".k-card .k-stepper__qty"); return c ? Number(c.textContent) : 0 })
const cartQty = () => (mock.cart?.items ?? []).reduce((n, i) => n + i.quantity, 0)
const firstVisible = () => page.evaluate(() => { const g = document.querySelector(".k-grid"); const pad = parseFloat(getComputedStyle(g).scrollPaddingTop); return { index: [...g.querySelectorAll(".k-card")].findIndex((c) => c.offsetTop >= g.scrollTop - pad + 1), top: g.scrollTop } })
const isVisible = (i) => page.evaluate((i) => { const g = document.querySelector(".k-grid").getBoundingClientRect(); const r = document.querySelectorAll(".k-card")[i].getBoundingClientRect(); return r.top >= g.top - 1 && r.bottom <= g.bottom + 1 }, i)

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.waitForTimeout(300)

// ---------- A. a burst of "+" taps with turns in the middle (server takes 400 ms per change)
mock.cartDelay = 400
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
await page.waitForSelector(".k-stepper")
const taps = 7
for (let i = 0; i < taps; i++) {
  await page.evaluate(() => document.querySelector(".k-card .k-stepper__plus").click())
  if (i === 1) await turn(LAND)
  if (i === 3) await turn(PORT)
  if (i === 5) await turn(LAND)
  await page.waitForTimeout(60)
}
check("A: the card shows every tap at once, turns included", (await shownQty()) === 1 + taps, `shows ${await shownQty()}`)
await page.waitForTimeout(4500)
check("A: Medusa ends up with every tap", cartQty() === 1 + taps, `cart ${cartQty()} of ${1 + taps}`)
check("A: the panel and the card agree", (await page.evaluate(() => document.querySelector(".k-line__qty")?.textContent)) === String(1 + taps))
mock.cartDelay = 0

// ---------- B. 20 quick turns in a row
await turn(PORT)
await page.waitForTimeout(600)
await page.evaluate(() => { const g = document.querySelector(".k-grid"); g.scrollTo({ top: g.querySelectorAll(".k-card")[6].offsetTop - 121, behavior: "instant" }) })
await page.waitForTimeout(500)
const before = await firstVisible()
const callsB = mock.calls.length
for (let i = 0; i < 20; i++) { await turn(i % 2 === 0 ? LAND : PORT); await page.waitForTimeout(30 + (i * 37) % 110) }
await page.waitForTimeout(900)
check("B: after 20 turns the layout matches the screen", (await orient()) === "portrait")
check("B: no requests from turning", mock.calls.length === callsB, `${mock.calls.length - callsB} extra`)
check("B: same place in the list", (await firstVisible()).index === before.index, `${before.index} -> ${(await firstVisible()).index}`)
check("B: cart quantity untouched", (await shownQty()) === 1 + taps)

// ---------- G. no drift over repeated round trips
const tops = []
for (let i = 0; i < 6; i++) {
  await turn(LAND); await page.waitForTimeout(700)
  const inLand = await isVisible(6)
  await turn(PORT); await page.waitForTimeout(700)
  tops.push((await firstVisible()).top)
  if (!inLand) check(`G: product 6 in view in landscape (round ${i})`, false)
}
check("G: 6 round trips put the list back exactly where it was", tops.every((t) => t === before.top), `tops ${tops.join(",")} (started ${before.top})`)
check("G: product 6 stays in view", await isVisible(6))

// ---------- E. a finger down across a turn
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[3].scrollIntoView({ block: "center" }))
await page.waitForTimeout(500)
const pos = await page.evaluate(() => { const b = document.querySelector(".k-card .k-add"); const r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
if (pos) {
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()
  await turn(LAND)
  await page.waitForTimeout(300)
  await page.mouse.up()
}
await page.waitForTimeout(900)
check("E: no button is left looking pressed after a turn mid-touch", (await page.locator(".is-pressed").count()) === 0)
check("E: the page still works (tap a + after it)", await page.evaluate(() => { document.querySelector(".k-card .k-stepper__plus").click(); return true }))
await page.waitForTimeout(1000)
await turn(PORT)
await page.waitForTimeout(500)

// ---------- C. turning while "Guardando tu pedido…" is on screen
mock.cartDelay = 1500
await page.evaluate(() => { document.querySelector(".k-card .k-stepper__plus").click(); document.querySelector(".k-card .k-stepper__plus").click() })
const expectedQty = (await shownQty())
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await page.click(".k-method__option >> nth=0")
await page.waitForSelector('.k-method__option[aria-busy="true"]', { timeout: 3000 })
check("C: 'Guardando tu pedido…' is showing", /Guardando/.test(await page.textContent('.k-method__option[aria-busy="true"]')))
await turn(LAND); await page.waitForTimeout(200); await turn(PORT); await page.waitForTimeout(200); await turn(LAND)
check("C: still showing it after three turns", (await page.locator('.k-method__option[aria-busy="true"]').count()) === 1)
await page.waitForSelector(".payment-qr", { timeout: 15000 })
check("C: the invoice appeared and the order held every tap", cartQty() === expectedQty, `cart ${cartQty()} of ${expectedQty}`)
mock.cartDelay = 0

// ---------- D. a live invoice, turned about while the kiosk polls; then it is paid
await page.evaluate(() => { document.querySelector(".payment-qr").__tag = "same" })
const srcBefore = await page.evaluate(() => document.querySelector(".payment-qr").src)
const secs = async () => page.evaluate(() => { const m = document.querySelector(".payment-countdown").textContent.match(/(\d+):(\d+)/); return Number(m[1]) * 60 + Number(m[2]) })
const s0 = await secs()
const pollsBefore = mock.calls.filter((c) => c === "GET /store/carts/cart_1").length
for (let i = 0; i < 8; i++) { await turn(i % 2 === 0 ? PORT : LAND); await page.waitForTimeout(450) }
const s1 = await secs()
const polls = mock.calls.filter((c) => c === "GET /store/carts/cart_1").length - pollsBefore
check("D: the countdown kept running through the turns", s1 < s0 && s0 - s1 <= 6, `${s0}s -> ${s1}s`)
check("D: same QR image, same invoice", (await page.evaluate(() => document.querySelector(".payment-qr").__tag === "same" && document.querySelector(".payment-qr").src)) === srcBefore)
check("D: payment polling went on during the turns", polls >= 4, `${polls} polls`)
mock.orderItems = [{ id: "i1", quantity: 2, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
mock.paid = true
await page.waitForSelector(".done-title", { timeout: 8000 })
await turn(PORT); await page.waitForTimeout(150); await turn(LAND)
check("D: paid while turning: the order completed exactly once", mock.calls.filter((c) => c === "POST /store/carts/cart_1/complete").length === 1, `${mock.calls.filter((c) => c === "POST /store/carts/cart_1/complete").length} complete mock.calls`)

// ---------- H. Byte's video keeps playing through a turn on the done screen
const t0 = await page.evaluate(() => { const v = document.querySelector("video.done-art"); return v ? v.currentTime : -1 })
await page.waitForTimeout(400)
await turn(PORT)
await page.waitForTimeout(600)
const t1 = await page.evaluate(() => { const v = document.querySelector("video.done-art"); return v ? { t: v.currentTime, paused: v.paused } : null })
check("H: Byte's video plays on (not restarted, not paused)", t1 && !t1.paused && t1.t !== t0 /* moved on, or looped */, JSON.stringify({ t0, t1 }))
mock.paid = false

// ---------- F. a turn counts as activity for the 60 s idle reset (fake clock)
{
  const ctx3 = await browser.newContext({ viewport: PORT, serviceWorkers: "block" })
  const p3 = await ctx3.newPage()
  await createMock().install(p3)
  await p3.clock.install()
  await p3.goto(server.url)
  await p3.clock.resume()
  await p3.waitForSelector(".k-idle")
  await p3.click(".k-idle")
  await p3.waitForSelector(".k-card")
  const screenIs = () => p3.evaluate(() => (document.querySelector(".k-idle") ? "idle" : "shop"))
  await p3.clock.fastForward(50_000)
  check("F: after 50 s of nothing the shop is still up", (await screenIs()) === "shop")
  await p3.setViewportSize(LAND)
  await p3.waitForTimeout(300)
  await p3.clock.fastForward(50_000)
  check("F: a turn at 50 s kept it up for another 50 s", (await screenIs()) === "shop")
  await p3.clock.fastForward(20_000)
  const backToIdle = await p3.waitForSelector(".k-idle", { timeout: 4000 }).then(() => true, () => false)
  check("F: 70 s after the turn with nothing touched: back to the start screen", backToIdle)
  await ctx3.close()
}

check("no page errors across all of it", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
await server.close()
finish()
