// Traffic lights beside Byte while an invoice is created: one per service (Yadio, coinos.io, Bark),
// amber from the tap, green as each answers, red when one fails or is still missing 1 s before the
// 15 s limit, off when the method doesn't use it.
import { createChecker, createMock, LANDSCAPE, launch, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const lights = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".invoice-light")].map((l) => [l.dataset.service, l.dataset.light])))
const waitFor = (page, want, timeout) =>
  page.waitForFunction((want) => {
    const now = Object.fromEntries([...document.querySelectorAll(".invoice-light")].map((l) => [l.dataset.service, l.dataset.light]))
    return Object.entries(want).every(([k, v]) => now[k] === v)
  }, want, { timeout, polling: 50 }).then(() => true, () => false)

async function start(viewport, setup, button) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.arkEnabled = true
  mock.bip321Enabled = true
  setup(mock)
  await mock.install(page)
  const errors = watchErrors(page)
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-pay:visible")
  await page.waitForSelector(".k-method")
  await page.click(button)
  await page.waitForSelector(".invoice-light")
  return { ctx, page, mock, errors }
}

// Bolt12/Ark: all three, answering one after the other; layout in both orientations.
for (const [name, viewport] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  const { ctx, page, errors } = await start(viewport, (m) => { m.sessionDelay = 4000; m.serviceTimes = { yadio: 100, coinos: 1500, bark: 3000 } }, ".k-method__option--bip321")
  const first = await lights(page)
  check(`${name}: all three amber from the tap`, first.yadio === "amber" && first.coinos === "amber" && first.bark === "amber", JSON.stringify(first))
  const layout = await page.evaluate(() => {
    const stage = document.querySelector(".k-stage").getBoundingClientRect()
    const art = document.querySelector(".byte-loader__art").getBoundingClientRect()
    const box = document.querySelector(".invoice-lights").getBoundingClientRect()
    const label = document.querySelector(".byte-loader__label").getBoundingClientRect()
    const cancel = document.querySelector(".back-button").getBoundingClientRect()
    const inside = [art, box, label, cancel].every((r) => r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1)
    return { rightOfByte: box.left >= art.right, inside, aboveLabel: box.bottom <= label.top + 1, centredOnByte: Math.abs((box.top + box.bottom) / 2 - (art.top + art.bottom) / 2) < 4 }
  })
  check(`${name}: lights to the right of the hoops, beside them, everything inside the stage`, layout.rightOfByte && layout.inside && layout.aboveLabel && layout.centredOnByte, JSON.stringify(layout))
  check(`${name}: Yadio green first`, await waitFor(page, { yadio: "green", coinos: "amber", bark: "amber" }, 1500))
  await page.screenshot({ path: `${SHOTS}/invoice-lights-${name}.png` })
  check(`${name}: then coinos.io green`, await waitFor(page, { yadio: "green", coinos: "green", bark: "amber" }, 2000))
  check(`${name}: then Bark green`, await waitFor(page, { yadio: "green", coinos: "green", bark: "green" }, 2500))
  check(`${name}: the QR follows`, await page.waitForSelector(".payment-qr", { timeout: 6000 }).then(() => true, () => false))
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

// When the invoice arrives, every light goes green at once (even if the last progress check lagged)
// and stays up about 600 ms before the QR.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 2500; m.serviceTimes = { yadio: 100, coinos: 500, bark: 60_000 } }, ".k-method__option--bip321")
  await waitFor(page, { yadio: "green", coinos: "green", bark: "amber" }, 2000)
  const allGreen = await waitFor(page, { yadio: "green", coinos: "green", bark: "green" }, 4000)
  const greenAt = Date.now()
  const qr = await page.waitForSelector(".payment-qr", { timeout: 3000 }).then(() => true, () => false)
  const held = Date.now() - greenAt
  check("invoice arrived: all green at once, then about 600 ms before the QR", allGreen && qr && held >= 500 && held <= 900, `${held} ms`)
  await ctx.close()
}

// Bolt11: Bark isn't used, so its light is off.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 1500; m.serviceTimes = { yadio: 100, coinos: 600, bark: 100 } }, ".k-method__option >> nth=0")
  const first = await lights(page)
  check("Bolt11: Bark off, Yadio and coinos.io amber", first.bark === "off" && first.yadio === "amber" && first.coinos === "amber", JSON.stringify(first))
  check("Bolt11: both turn green, Bark stays off", await waitFor(page, { yadio: "green", coinos: "green", bark: "off" }, 2000))
  await ctx.close()
}

// A service that reports a failure goes red at once.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 3000; m.serviceTimes = { yadio: 100, coinos: 500, bark: 1000 }; m.serviceFails = ["bark"] }, ".k-method__option--bip321")
  check("a failed service: red at once, the others green", await waitFor(page, { yadio: "green", coinos: "green", bark: "red" }, 2500))
  await ctx.close()
}

// A service that never answers: amber until 1 s before the 15 s limit, then red; then the kiosk gives up.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 17_000; m.serviceTimes = { yadio: 100, coinos: 800, bark: Infinity } }, ".k-method__option--bip321")
  const t0 = Date.now()
  await waitFor(page, { yadio: "green", coinos: "green", bark: "amber" }, 3000)
  await page.waitForTimeout(12_500 - (Date.now() - t0))
  const at125 = await lights(page)
  const red = await waitFor(page, { bark: "red" }, 3000)
  const redAt = (Date.now() - t0) / 1000
  check("never answers: still amber at 12.5 s, red at about 14 s", at125.bark === "amber" && red && redAt > 13.4 && redAt < 14.8, `${JSON.stringify(at125)} red at ${redAt.toFixed(1)} s`)
  const gaveUp = await page.waitForSelector(".k-method__error", { timeout: 4000 }).then(() => true, () => false)
  check("then the kiosk gives up at 15 s, back on the payment choice", gaveUp)
  await ctx.close()
}

await browser.close()
await server.close()
finish()
