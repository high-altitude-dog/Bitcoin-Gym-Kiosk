// Tapping a wallet's logo on a Bitcoin QR screen shows its details card in the QR's place (WalletCard.tsx):
// the QR hidden but kept, the time bar still running; another logo switches, the same logo or
// "Volver al QR de pago" closes; "¿Qué es esto?" lists the five sovereignty points; a turn keeps the card;
// the card closes by itself after 20 s untouched and when under a minute is left; English works.
import { createChecker, createMock, LANDSCAPE, launch, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

async function start(setup = () => {}, english = false) {
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  setup(mock)
  await mock.install(page)
  const errors = watchErrors(page)
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  if (english) await page.locator(".k-flag").nth(1).click()
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-pay:visible")
  await page.waitForSelector(".k-method")
  await page.click(".k-method__option >> nth=0")
  await page.waitForSelector(".payment-qr", { timeout: 15000 })
  await page.evaluate(() => { document.querySelector(".payment-qr").__tag = "same" })
  return { ctx, page, mock, errors }
}
const state = (page) => page.evaluate(() => {
  const stage = document.querySelector(".k-stage").getBoundingClientRect()
  const card = document.querySelector(".wallet-card")
  const qr = document.querySelector(".payment-qr")
  const box = (el) => el && el.getBoundingClientRect()
  const inside = (r) => r && r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1
  const cardChildrenInside = card ? [...card.querySelectorAll("*")].every((el) => { const r = el.getBoundingClientRect(); const c = card.getBoundingClientRect(); return !r.width || (r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1) }) : null
  return {
    open: card?.dataset.wallet ?? null,
    qrHidden: qr.hidden, sameQr: qr.__tag === "same",
    countdown: !!document.querySelector(".payment-countdown")?.textContent,
    pressed: [...document.querySelectorAll(".invoice-wallet__tile")].map((b) => b.getAttribute("aria-pressed")).join(","),
    dim: document.querySelectorAll(".invoice-wallet__tile.is-dim").length,
    cardInside: card ? inside(box(card)) : null, cardChildrenInside,
    rubric: document.querySelectorAll(".wallet-card__rubric li").length,
    text: card?.textContent ?? "",
  }
})
const tiles = (page) => page.locator(".invoice-wallet__tile")

{
  const { ctx, page, errors } = await start()
  check("four tappable logos, each with an i badge, and the hint", (await tiles(page).count()) === 4 && (await page.locator(".invoice-wallet__badge").count()) === 4 && /Toca un logo/.test(await page.locator(".invoice-wallets__hint").textContent()))
  const ids = await page.evaluate(() => [...document.querySelectorAll(".invoice-wallet__name")].map((n) => n.textContent))
  await tiles(page).nth(0).click()
  let s = await state(page)
  check("tap: that wallet's card in the QR's place, QR hidden but kept, time bar still there", s.open && s.qrHidden && s.sameQr && s.countdown && s.pressed.startsWith("true") && s.dim === 3, JSON.stringify({ ...s, text: undefined }))
  check("the card fits the stage and holds everything", s.cardInside && s.cardChildrenInside, JSON.stringify({ ...s, text: undefined }))
  // Every wallet on this screen, by name (the order is shuffled): rows at most two lines, the button
  // inside the card, and the set star score.
  const STARS = { Binance: 2, Blink: 2, "coinos.io": 4, Phoenix: 4 }
  const perWallet = []
  for (const name of Object.keys(STARS)) {
    await page.locator(".invoice-wallet__tile", { hasText: name }).click()
    perWallet.push(await page.evaluate((name) => {
      const card = document.querySelector(".wallet-card").getBoundingClientRect()
      const back = document.querySelector(".wallet-card__back").getBoundingClientRect()
      return { name, rows: [...document.querySelectorAll(".wallet-card__facts > div")].map((r) => Math.round(r.querySelector("dd").getBoundingClientRect().height)), stars: document.querySelectorAll(".wallet-card__stars .is-on").length, backInside: back.bottom <= card.bottom }
    }, name))
  }
  check("every wallet: each fact on at most two lines, the button inside, the set stars (Binance and Blink 2)", perWallet.every((w) => w.rows.every((h) => h <= 70) && w.backInside && w.stars === STARS[w.name]), JSON.stringify(perWallet))
  await page.locator(".invoice-wallet__tile").nth(0).click()
  await page.screenshot({ path: `${SHOTS}/wallet-card-portrait.png` })
  await page.setViewportSize(LANDSCAPE); await page.waitForTimeout(400)
  s = await state(page)
  check("turning keeps the card, and it fits in landscape", s.open !== null && s.cardInside && s.cardChildrenInside && s.sameQr, JSON.stringify({ ...s, text: undefined }))
  await page.screenshot({ path: `${SHOTS}/wallet-card-landscape.png` })
  await page.setViewportSize(PORTRAIT); await page.waitForTimeout(300)
  const first = s.open
  await tiles(page).nth(1).click()
  s = await state(page)
  check("another logo switches the card", s.open && s.open !== first && s.pressed.split(",")[1] === "true", `${first} -> ${s.open}`)
  await page.click(".wallet-card__what")
  s = await state(page)
  check("¿Qué es esto? lists the five points; the button reads Cerrar", s.rubric === 5 && /Cerrar/.test(await page.locator(".wallet-card__what").textContent()))
  await page.screenshot({ path: `${SHOTS}/wallet-card-rubric.png` })
  await tiles(page).nth(1).click()
  s = await state(page)
  check("the same logo again closes it: the same QR is back", s.open === null && !s.qrHidden && s.sameQr && s.dim === 0, JSON.stringify({ ...s, text: undefined }))
  await tiles(page).nth(2).click()
  await page.click(".wallet-card__back")
  s = await state(page)
  check("Volver al QR de pago closes it", s.open === null && !s.qrHidden)
  // Closes by itself after 20 s without a touch.
  await tiles(page).nth(3).click()
  await page.waitForTimeout(19_000)
  const still = (await state(page)).open !== null
  await page.waitForTimeout(2_000)
  check("left alone, the card closes after 20 s", still && (await state(page)).open === null)
  check("no page errors", errors.length === 0, errors.join(" | "))
  check(`wallet names in the order shown: ${ids.join(", ")}`, ids.length === 4)
  await ctx.close()
}

// Under a minute left: an open card closes, and a logo no longer opens one.
{
  const { ctx, page } = await start((m) => { m.expirySeconds = 64 })
  await tiles(page).nth(0).click()
  const opened = (await state(page)).open !== null
  await page.waitForTimeout(5_500)
  const closed = (await state(page)).open === null
  await tiles(page).nth(1).click()
  check("under a minute left: the open card closes, and a logo won't open one", opened && closed && (await state(page)).open === null)
  await ctx.close()
}

// English.
{
  const { ctx, page } = await start(() => {}, true)
  await tiles(page).nth(0).click()
  const s = await state(page)
  check("in English: the card's labels and the back button", /For/.test(s.text) && /Languages/.test(s.text) && /Your funds/.test(s.text) && /Back to the payment QR/.test(s.text) && /Tap a logo/.test(await page.locator(".invoice-wallets__hint").textContent()), s.text.slice(0, 200))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
