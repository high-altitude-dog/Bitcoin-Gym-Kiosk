// The drawing room while an invoice is created: one portrait per service (Yadio, coinos.io, Bark),
// red for 600 ms, amber while waiting, green as each answers, red when one fails or is still missing
// 1 s before the 15 s limit; a service the method doesn't use leaves an empty patch, not a portrait.
// (Until Oct 30, 2026 these were traffic lights; the elements keep the .invoice-light class.)
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
  // Record, inside the page, when the first portrait changes colour (sampling from outside can start
  // late while the WebGL fire keeps the test browser busy).
  await page.evaluate(() => {
    window.__lights = []
    new MutationObserver(() => {
      const l = document.querySelector(".invoice-light")
      const last = window.__lights[window.__lights.length - 1]
      if (l && (!last || last.v !== l.dataset.light)) window.__lights.push({ v: l.dataset.light, t: performance.now() })
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-light"] })
  })
  await page.click(button)
  await page.waitForSelector(".invoice-light")
  return { ctx, page, mock, errors }
}

// Bolt12/Ark: all three, answering one after the other; layout in both orientations.
for (const [name, viewport] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  const { ctx, page, errors } = await start(viewport, (m) => { m.sessionDelay = 4000; m.serviceTimes = { yadio: 900, coinos: 1800, bark: 3000 } }, ".k-method__option--bip321")
  const first = await lights(page)
  check(`${name}: all three red as the screen appears`, first.yadio === "red" && first.coinos === "red" && first.bark === "red", JSON.stringify(first))
  const amber = await waitFor(page, { yadio: "amber", coinos: "amber", bark: "amber" }, 1500)
  const seq = await page.evaluate(() => window.__lights)
  const redMs = seq[0]?.v === "red" && seq[1]?.v === "amber" ? Math.round(seq[1].t - seq[0].t) : null
  check(`${name}: then all three amber after about 600 ms`, amber && redMs !== null && redMs >= 550 && redMs <= 800, `red for ${redMs} ms`)
  const layout = await page.evaluate(() => {
    const stage = document.querySelector(".k-stage").getBoundingClientRect()
    const byte = document.querySelector(".dr-byte").getBoundingClientRect()
    const art = document.querySelector(".byte-loader__art")
    const pics = [...document.querySelectorAll(".dr-painting")].map((p) => p.getBoundingClientRect())
    const plaques = [...document.querySelectorAll(".dr-plaque")].map((p) => p.getBoundingClientRect())
    const range = document.createRange(); range.selectNodeContents(document.querySelector(".dr-caption"))
    const caption = range.getBoundingClientRect()
    const cancel = document.querySelector(".dr-cancel").getBoundingClientRect()
    const within = (r) => r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1
    // A few px of slack: the crooked paintings' bounding boxes are a little bigger than the paintings.
    const apart = (a, b) => a.right <= b.left + 8 || b.right <= a.left + 8 || a.bottom <= b.top + 8 || b.bottom <= a.top + 8
    const all = [...pics, ...plaques, caption, cancel]
    return {
      portraits: pics.length, plaques: plaques.length,
      rightOfByte: pics.every((p) => p.left >= byte.right - 120 * (stage.width / (stage.width > stage.height ? 1920 : 1200))),
      inside: all.every(within),
      noOverlap: all.every((a, i) => all.every((b, j) => i === j || apart(a, b))) || pics.length === 0,
      captionClear: apart(caption, cancel),
      video: art?.tagName, playing: art instanceof HTMLVideoElement ? !art.paused : null,
    }
  })
  check(`${name}: three portraits with plaques to the right of the hoops, caption and Cancelar clear, all inside the stage`, layout.portraits === 3 && layout.plaques === 3 && layout.rightOfByte && layout.inside && layout.noOverlap && layout.captionClear && layout.video === "VIDEO", JSON.stringify(layout))
  check(`${name}: portraits left to right as their services usually answer: Yadio, Bark, coinos.io`, await page.evaluate(() => [...document.querySelectorAll(".dr-painting")].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((p) => p.dataset.service).join(",")) === "yadio,bark,coinos")
  check(`${name}: each portrait shows the painting for its state`, await page.evaluate(() => [...document.querySelectorAll(".dr-painting")].every((p) => { const shown = [...p.querySelectorAll("img")].filter((i) => !i.hidden); return shown.length === 1 && shown[0].src.includes(`-${p.dataset.light}.webp`) && shown[0].complete && shown[0].naturalWidth > 0 })))
  check(`${name}: Yadio green first`, await waitFor(page, { yadio: "green", coinos: "amber", bark: "amber" }, 1500))
  await page.screenshot({ path: `${SHOTS}/invoice-lights-${name}.png` })
  check(`${name}: then coinos.io green`, await waitFor(page, { yadio: "green", coinos: "green", bark: "amber" }, 2000))
  check(`${name}: then Bark green`, await waitFor(page, { yadio: "green", coinos: "green", bark: "green" }, 2500))
  check(`${name}: the QR follows`, await page.waitForSelector(".payment-qr", { timeout: 6000 }).then(() => true, () => false))
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

// When the invoice arrives, every light goes green at once (even if the last progress check lagged)
// and stays up about 950 ms before the QR.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 2500; m.serviceTimes = { yadio: 100, coinos: 500, bark: 60_000 } }, ".k-method__option--bip321")
  await waitFor(page, { yadio: "green", coinos: "green", bark: "amber" }, 2000)
  const allGreen = await waitFor(page, { yadio: "green", coinos: "green", bark: "green" }, 4000)
  const greenAt = Date.now()
  const qr = await page.waitForSelector(".payment-qr", { timeout: 3000 }).then(() => true, () => false)
  const held = Date.now() - greenAt
  check("invoice arrived: all green at once, then about 950 ms before the QR", allGreen && qr && held >= 850 && held <= 1450, `${held} ms`)
  await ctx.close()
}

// Bolt11: Bark isn't used, so its light is off.
{
  const { ctx, page } = await start(PORTRAIT, (m) => { m.sessionDelay = 2000; m.serviceTimes = { yadio: 900, coinos: 1200, bark: 100 } }, ".k-method__option >> nth=0")
  const first = await lights(page)
  check("Bolt11: only Yadio and coinos.io, both red at first (no Bark portrait)", Object.keys(first).join(",") === "yadio,coinos" && first.yadio === "red" && first.coinos === "red", JSON.stringify(first))
  const pair = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll(".dr-painting")].map((p) => p.getBoundingClientRect()).sort((x, y) => x.left - y.left)
    const scale = document.querySelector(".k-stage").getBoundingClientRect().width / 1200
    return { gap: Math.round((b.left - a.right) / scale), stage: document.querySelector(".k-stage").getBoundingClientRect(), inside: [a, b].every((r) => r.right <= document.querySelector(".k-stage").getBoundingClientRect().right + 1) }
  })
  check("Bolt11: the two portraits hang close together, inside the stage", pair.gap > 0 && pair.gap < 60 && pair.inside, JSON.stringify(pair))
  check("Bolt11: then both amber", await waitFor(page, { yadio: "amber", coinos: "amber" }, 1000))
  check("Bolt11: both turn green", await waitFor(page, { yadio: "green", coinos: "green" }, 2000))
  await page.screenshot({ path: `${SHOTS}/invoice-lights-bolt11.png` })
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
