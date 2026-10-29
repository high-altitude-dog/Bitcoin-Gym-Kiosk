// A dog bark once when a Bitcoin payment is confirmed ("¡Pago recibido!"), for Lightning, Bitcoin Ark
// and BIP321; never for cash or bank QR. Audio playback is recorded, not heard.
import fs from "node:fs"
import path from "node:path"
import { createChecker, createMock, launch, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const dist = process.env.KIOSK_DIST
check("the bark ships with the build", fs.existsSync(path.join(dist, "kiosk/sounds/dog-bark.mp3")))
check("and is precached for offline use", fs.readFileSync(path.join(dist, "sw.js"), "utf8").includes("kiosk/sounds/dog-bark.mp3"))

// Each play() is recorded with the file it would play.
const recordPlays = () => {
  window.__plays = []
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push(this.src)
    return Promise.resolve()
  }
}
const plays = (page) => page.evaluate(() => window.__plays)

const toMethods = async (page) => {
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  // Bs 1 + Bs 5: the Bs 6 the mock's invoices are for.
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-bar .k-pay")
  await page.waitForSelector(".k-method")
}

for (const [name, button] of [["Lightning", ".k-method__option >> nth=0"], ["Bitcoin Ark", ".k-method__option--ark"], ["BIP321", ".k-method__option--bip321"]]) {
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  await ctx.addInitScript(recordPlays)
  const page = await ctx.newPage()
  const mock = createMock()
  mock.arkEnabled = true
  mock.bip321Enabled = true
  // The order takes a while, so the bark must come with "¡Pago recibido!", not with the order.
  mock.completeDelay = 1500
  mock.orderItems = [{ id: "i1", quantity: 1, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
  await mock.install(page)
  const errors = watchErrors(page)
  await toMethods(page)
  await page.click(button)
  await page.waitForSelector(".payment-qr", { timeout: 10000 })
  check(`${name}: silent while the QR waits`, (await plays(page)).length === 0, JSON.stringify(await plays(page)))

  mock.paid = true
  await page.waitForSelector(".done-title")
  const atReceived = await plays(page)
  const title = await page.textContent(".done-title")
  await page.waitForSelector(".done-new", { timeout: 10000 })
  await page.waitForTimeout(500)
  const after = await plays(page)
  check(`${name}: one bark as "${title}" appears`, atReceived.length === 1 && /dog-bark\.mp3$/.test(atReceived[0]), JSON.stringify(atReceived))
  check(`${name}: no second bark when the order arrives`, after.length === 1, JSON.stringify(after))
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

for (const [name, button] of [["cash", ".k-method__option--cash"], ["bank QR", ".k-method__option--bank-qr"]]) {
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  await ctx.addInitScript(recordPlays)
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  await toMethods(page)
  await page.click(button)
  await page.click(".bank-qr-paid")
  await page.waitForSelector(".done-title")
  await page.waitForTimeout(800)
  check(`${name}: no bark`, (await plays(page)).length === 0, JSON.stringify(await plays(page)))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
