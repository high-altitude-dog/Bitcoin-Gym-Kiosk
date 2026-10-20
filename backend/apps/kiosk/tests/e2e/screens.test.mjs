// Every other screen in both orientations: payment method, invoice wait, Lightning QR, bank QR, done (3 and 9 lines), cash, connection error.
import fs from "node:fs"
import { API, cors, createChecker, createMock, launch, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
await mock.install(page)
const errors = watchErrors(page)
const { check, finish } = createChecker()
mock.availabilityDelay = 1800 // long enough to see the "creating the invoice" screen

const outside = () => page.evaluate(() => {
  const stage = document.querySelector(".k-stage").getBoundingClientRect()
  const bad = []
  for (const el of document.querySelectorAll(".k-stage .screen *")) {
    if (el.closest(".done-items__list") && !el.matches(".done-items__list")) continue
    const cs = getComputedStyle(el)
    if (cs.display === "contents") continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (r.left < stage.left - 1 || r.top < stage.top - 1 || r.right > stage.right + 1 || r.bottom > stage.bottom + 1)
      bad.push(`${el.tagName.toLowerCase()}.${el.className}: ${Math.round(r.left)},${Math.round(r.top)} - ${Math.round(r.right)},${Math.round(r.bottom)}`)
  }
  return bad
})
const overlaps = () => page.evaluate(() => {
  // leaf elements with text or images inside the screen must not overlap each other
  const els = [...document.querySelectorAll(".k-stage .screen *, .k-stage .k-method *")].filter((el) => {
    if (getComputedStyle(el).display === "contents") return false
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    if (el.closest(".done-items__list") && !el.matches(".done-items__list")) return false
    return el.matches("button, img, video, h1, h2, p, .payment-qr, .done-items") || false
  })
  const hits = []
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]
    if (a.contains(b) || b.contains(a)) continue
    if (a.matches(".done-art") || b.matches(".done-art")) continue
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
    if (w > 4 && h > 4) hits.push(`${a.tagName.toLowerCase()}.${a.className} x ${b.tagName.toLowerCase()}.${b.className} (${Math.round(w)}x${Math.round(h)})`)
  }
  return hits
})
const rect = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null }, sel)
const both = async (name, extra) => {
  await page.setViewportSize({ width: 1200, height: 1920 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/${name}-portrait.png` })
  const pOut = await outside(), pOver = await overlaps()
  check(`${name} portrait: nothing outside the stage, no overlaps`, pOut.length === 0 && pOver.length === 0, [...pOut, ...pOver].slice(0, 3).join(" | "))
  await page.setViewportSize({ width: 1920, height: 1200 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/${name}-landscape.png` })
  const lOut = await outside(), lOver = await overlaps()
  check(`${name} landscape: nothing outside the stage, no overlaps`, lOut.length === 0 && lOver.length === 0, [...lOut, ...lOver].slice(0, 3).join(" | "))
  if (extra) await extra()
  await page.setViewportSize({ width: 1200, height: 1920 })
  await page.waitForTimeout(400)
}

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.evaluate(() => { document.querySelectorAll(".k-card .k-add")[0].click(); })
await page.waitForSelector(".k-stepper")
await page.waitForTimeout(1500)

// 1. payment method
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await both("1-payment-method", async () => {
  const opts = await page.evaluate(() => [...document.querySelectorAll(".k-method__option")].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }))
  check("payment method landscape: three options side by side, same row", opts.length === 3 && opts.every((o) => o.y === opts[0].y) && opts[0].x < opts[1].x && opts[1].x < opts[2].x, JSON.stringify(opts))
})
{
  const colours = await page.evaluate(() => [...document.querySelectorAll(".k-method__option")].map((e) => { const s = getComputedStyle(e); return `${s.backgroundColor} / ${s.color}` }))
  check("payment method: Bitcoin orange, bank QR blue, cash green, white text on blue and green",
    JSON.stringify(colours) === JSON.stringify(["rgb(255, 141, 0) / rgb(28, 28, 28)", "rgb(31, 111, 209) / rgb(255, 255, 255)", "rgb(31, 157, 77) / rgb(255, 255, 255)"]), colours.join(" | "))
}
const callsBefore = mock.calls.length

// 2. creating the invoice (Byte) then 3. the QR
await page.click(".k-method__option >> nth=0")
await page.waitForSelector(".byte-loader")
await both("2-creating-invoice")
await page.waitForSelector(".payment-qr", { timeout: 15000 })
await page.waitForTimeout(500)
await page.evaluate(() => { document.querySelector(".payment-qr").__tag = "same" })
await both("3-lightning-qr", async () => {
  const qr = await rect(".payment-qr"), sats = await rect(".payment-sats"), cancel = await rect(".back-button")
  check("lightning landscape: QR 720x720 on the left, amounts and button on the right", qr.w === 720 && qr.h === 720 && qr.x < sats.x && qr.x < cancel.x, `qr ${JSON.stringify(qr)} sats ${JSON.stringify(sats)}`)
  check("lightning landscape: QR image is the same element (not rebuilt)", await page.evaluate(() => document.querySelector(".payment-qr").__tag === "same"))
})
check("QR image survived both turns", await page.evaluate(() => document.querySelector(".payment-qr").__tag === "same"))
check("turning on the QR screen: only payment polling requests", mock.calls.slice(callsBefore).every((c) => /GET \/store\/carts\/cart_1|payment|shipping|lightning/.test(c)), mock.calls.slice(callsBefore).filter((c) => !/GET \/store\/carts\/cart_1/.test(c)).join(","))

// 4. bank QR
await page.click(".back-button")
await page.waitForSelector(".k-method")
await page.click(".k-method__option--bank-qr")
await page.waitForSelector(".payment-qr--bank")
// The BCP logo has loaded and sits right under the bank QR, centred on it.
async function logoUnderQr(orientation) {
  const r = await page.evaluate(() => {
    const q = document.querySelector(".payment-qr--bank").getBoundingClientRect(), l = document.querySelector(".bank-logo").getBoundingClientRect(), img = document.querySelector(".bank-logo img")
    return { gap: Math.round(l.top - q.bottom), dx: Math.round(l.left + l.width / 2 - (q.left + q.width / 2)), loaded: img.complete && img.naturalWidth > 0 }
  })
  check(`bank QR ${orientation}: BCP logo loaded, under the QR and centred`, r.loaded && r.gap >= 0 && r.gap <= 60 && Math.abs(r.dx) <= 2, JSON.stringify(r))
}
// The rendered QR is saved so it can be decoded and compared with the printed card.
fs.writeFileSync(`${SHOTS}/bank-qr.png`, Buffer.from((await page.getAttribute(".payment-qr--bank", "src")).split(",")[1], "base64"))
await both("4-bank-qr", async () => {
  const ph = await rect(".payment-qr--bank"), h1 = await rect(".payment-side h1")
  check("bank QR landscape: QR left, title right", ph.x < h1.x, `ph ${JSON.stringify(ph)} h1 ${JSON.stringify(h1)}`)
  await logoUnderQr("landscape")
})
await logoUnderQr("portrait")

// 5. done (3 lines, mixed delivery) via "Pagado"
mock.orderItems = [
  { id: "i1", quantity: 2, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" },
  { id: "i2", quantity: 1, title: "Creatine Monohydrate", product_title: "Creatine Monohydrate", thumbnail: null, product_type: "Entrega del personal" },
  { id: "i3", quantity: 1, title: "Sandwich de pollo con palta y tomate", product_title: "Sandwich de pollo con palta y tomate", thumbnail: null, product_type: "Café asociado" },
]
await page.click(".bank-qr-paid")
await page.waitForSelector(".done-title")
await page.waitForTimeout(600)
await page.evaluate(() => { document.querySelector(".done-art").__tag = "same" })
await both("5-done-3-lines", async () => {
  const hero = await rect(".done-hero"), side = await rect(".done-side"), art = await rect(".done-art")
  check("done landscape: hero left, list and button right, Byte 560", hero.x < side.x && art.w === 560, `hero ${JSON.stringify(hero)} side ${JSON.stringify(side)} art ${art.w}`)
  check("done landscape: Byte video is the same element", await page.evaluate(() => document.querySelector(".done-art").__tag === "same"))
})

// 6. done with a long order (9 lines): list scrolls, nothing else overflows
mock.orderItems = Array.from({ length: 9 }, (_, i) => ({ id: "x" + i, quantity: 1 + (i % 3), title: "Producto " + (i + 1), product_title: "Producto número " + (i + 1) + " de la lista", thumbnail: null, product_type: i === 4 ? "Café asociado" : "Autoservicio" }))
// restart the order flow
await page.evaluate(() => document.querySelector(".done-new").click())
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.evaluate(() => { document.querySelectorAll(".k-card .k-add")[1].click() })
await page.waitForTimeout(1500)
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await page.click(".k-method__option--bank-qr")
await page.waitForSelector(".payment-qr--bank")
await page.click(".bank-qr-paid")
await page.waitForSelector(".done-title")
await page.waitForTimeout(600)
await both("6-done-9-lines", async () => {
  const list = await page.evaluate(() => { const l = document.querySelector(".done-items__list"); return { client: l.clientHeight, scroll: l.scrollHeight } })
  check("done landscape, 9 lines: the list scrolls inside its card", list.scroll > list.client, JSON.stringify(list))
})
await page.evaluate(() => document.querySelector(".done-new").click())

// 6b. cash: confirm screen, then "Paga en recepción" with the amount due
mock.orderItems = [{ id: "c1", quantity: 2, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.evaluate(() => { document.querySelectorAll(".k-card .k-add")[0].click() })
await page.waitForTimeout(1500)
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await page.click(".k-method__option >> nth=2")
await page.waitForSelector(".bank-qr-paid")
check("cash: confirm screen asks to pay at the desk", (await page.textContent(".screen h1")).includes("en efectivo"), await page.textContent(".screen h1"))
await both("6b-cash-confirm")
const providersBefore = mock.sessionProviders.length
// A double tap must place one order.
await page.evaluate(() => { const b = document.querySelector(".bank-qr-paid"); b.click(); b.click() })
await page.waitForSelector(".done-title")
await page.waitForTimeout(600)
check("cash: one payment session, with the cash provider", JSON.stringify(mock.sessionProviders.slice(providersBefore)) === JSON.stringify(["pp_cash_cash"]), JSON.stringify(mock.sessionProviders.slice(providersBefore)))
check("cash done: title says pay at the desk", (await page.textContent(".done-title")) === "Paga en recepción", await page.textContent(".done-title"))
check("cash done: shows the amount due", /^Bs \d/.test(await page.textContent(".done-due")), await page.textContent(".done-due"))
check("cash done: self-serve list is not 'take your products' yet", (await page.textContent(".done-items__title")) === "Tu compra", await page.textContent(".done-items__title"))
await both("6b-cash-done")
await page.evaluate(() => document.querySelector(".done-new").click())

// 7. connection error, in its own page: the catalogue request fails
const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 1920 }, serviceWorkers: "block" })
const page2 = await ctx2.newPage()
await page2.route(`${API}/**`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 500, headers: cors, body: "{}" }))
await page2.goto(server.url)
await page2.waitForSelector(".conn-error", { timeout: 20000 })
await page2.waitForTimeout(800)
for (const [name, vp] of [["7-connection-error-portrait", { width: 1200, height: 1920 }], ["7-connection-error-landscape", { width: 1920, height: 1200 }]]) {
  await page2.setViewportSize(vp)
  await page2.waitForTimeout(500)
  await page2.screenshot({ path: `${SHOTS}/${name}.png` })
  const bad = await page2.evaluate(() => { const st = document.querySelector(".k-stage").getBoundingClientRect(); return [...document.querySelectorAll(".conn-error *")].filter((e) => getComputedStyle(e).display !== "contents").map((e) => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width && (r.left < st.left - 1 || r.top < st.top - 1 || r.right > st.right + 1 || r.bottom > st.bottom + 1)).map(([e]) => e.className) })
  check(`${name}: nothing outside the stage`, bad.length === 0, bad.join(","))
}
const art = await page2.evaluate(() => { const a = document.querySelector(".conn-error__art").getBoundingClientRect(), b = document.querySelector(".conn-error__body").getBoundingClientRect(); return { artRight: a.right, bodyLeft: b.left } })
check("connection error landscape: Byte left of the text", art.artRight <= art.bodyLeft, JSON.stringify(art))

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))
await browser.close()
await server.close()
finish()
