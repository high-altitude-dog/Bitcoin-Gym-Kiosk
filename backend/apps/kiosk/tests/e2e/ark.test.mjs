// "Bitcoin Ark": a purple fourth payment button (only when the region offers Bark Pay), one QR
// holding the BIP 321 URI (Ark + Lightning), and a paid charge completing the order once.
import QRCode from "qrcode"
import { ARK_PROVIDER, ARK_URI, createChecker, invoiceLayout, createMock, LANDSCAPE, launch, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const toPayment = async (page) => {
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  // Bs 1 + Bs 5: the Bs 6 the mock's charge is for, so a live charge can be reused.
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(PORTRAIT_OR_LANDSCAPE_PAY)
  await page.waitForSelector(".k-method")
}
const PORTRAIT_OR_LANDSCAPE_PAY = ".k-pay:visible"

// Hidden where Bark Pay isn't configured.
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  await mock.install(page)
  await toPayment(page)
  check("no Ark button without Bark Pay", (await page.$$(".k-method__option")).length === 3 && !(await page.$(".k-method__option--ark")))
  await ctx.close()
}

for (const [name, viewport] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.arkEnabled = true
  await mock.install(page)
  const errors = watchErrors(page)
  await toPayment(page)

  const layout = await page.evaluate(() => {
    const stage = document.querySelector(".k-stage").getBoundingClientRect()
    const buttons = [...document.querySelectorAll(".k-method__option, .k-method__back")].map((b) => b.getBoundingClientRect())
    const inside = buttons.every((r) => r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1)
    const apart = buttons.every((a, i) => buttons.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top))
    const options = [...document.querySelectorAll(".k-method__option")]
    const ark = document.querySelector(".k-method__option--ark")
    return {
      inside,
      apart,
      labels: options.map((o) => o.textContent),
      arkSecond: options[1] === ark,
      bg: getComputedStyle(ark).backgroundColor,
      fits: options.every((o) => o.scrollWidth <= o.clientWidth + 1 && o.scrollHeight <= o.clientHeight + 1),
    }
  })
  check(`${name}: four options, Bitcoin Ark right after Bolt11, purple`, layout.labels.length === 4 && layout.arkSecond && layout.labels[1] === "Pagar con Bitcoin Ark/Bolt11" && layout.bg === "rgb(123, 63, 228)", JSON.stringify(layout))
  check(`${name}: buttons inside the stage, not overlapping, text fits`, layout.inside && layout.apart && layout.fits, JSON.stringify(layout))
  await page.screenshot({ path: `${SHOTS}/ark-method-${name}.png` })

  await page.click(".k-method__option--ark")
  await page.waitForSelector(".payment-qr", { timeout: 10000 })
  const shown = await page.evaluate(() => ({
    src: document.querySelector(".payment-qr").getAttribute("src"),
    mark: document.querySelector(".payment-ark-mark")?.textContent,
    note: [...document.querySelectorAll(".payment-note")].map((n) => n.textContent).join(" | "),
    sats: document.querySelector(".payment-sats")?.textContent,
  }))
  // Module by module: the on-screen image sampled at each cell's centre against the matrix the
  // same library builds for ARK_URI (PNG bytes differ between Node and the browser).
  const { modules } = QRCode.create(ARK_URI)
  const onScreen = await page.evaluate(async ({ src, size }) => {
    const img = new Image(); img.src = src; await img.decode()
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height
    const g = c.getContext("2d"); g.drawImage(img, 0, 0)
    const cell = img.width / (size + 2), px = g.getImageData(0, 0, c.width, c.height).data
    const bits = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (Math.floor((y + 1.5) * cell) * c.width + Math.floor((x + 1.5) * cell)) * 4
      bits.push(px[i] < 128 ? 1 : 0)
    }
    return bits.join("")
  }, { src: shown.src, size: modules.size })
  const expected = Array.from(modules.data, (b) => (b ? 1 : 0)).join("")
  check(`${name}: an Ark session was created`, mock.sessionProviders.at(-1) === ARK_PROVIDER, JSON.stringify(mock.sessionProviders))
  check(`${name}: the QR holds the BIP 321 URI (Ark + Lightning)`, onScreen === expected, `${modules.size}x${modules.size}`)
  check(`${name}: Bitcoin Ark mark, sats and the Ark-or-Lightning note`, shown.mark === "Bitcoin Ark/Bolt11" && /588/.test(shown.sats) && /Ark o Lightning/.test(shown.note), JSON.stringify({ ...shown, src: undefined }))
  const inv = await invoiceLayout(page)
  check(`${name}: chip "Bitcoin Ark/Bolt11", wallets Arké, Noah and Coinos, logos loaded, nothing overlapping`, inv.chip === "Bitcoin Ark/Bolt11" && inv.wallets === "Arké,Noah,Coinos" && inv.logosLoaded && inv.inside && inv.apart, JSON.stringify(inv))
  await page.screenshot({ path: `${SHOTS}/ark-qr-${name}.png` })

  if (name === "portrait") {
    // Cancel and back to Ark with the same total: the same live charge, no second one.
    await page.click(".back-button")
    await page.waitForSelector(".k-method")
    await page.click(".k-method__option--ark")
    await page.waitForSelector(".payment-qr")
    check("Cancelar then Ark again reuses the live charge", mock.sessionProviders.filter((p) => p === ARK_PROVIDER).length === 1, JSON.stringify(mock.sessionProviders))

    mock.orderItems = [{ id: "i1", quantity: 1, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
    mock.paid = true
    await page.waitForSelector(".done-new", { timeout: 10000 })
    await page.waitForTimeout(1500)
    const completes = mock.calls.filter((c) => c === "POST /store/carts/cart_1/complete").length
    check("a paid Ark charge completes the order once", completes === 1 && (await page.textContent(".done-title")) === "¡Gracias!", `completes=${completes}`)
  }
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
