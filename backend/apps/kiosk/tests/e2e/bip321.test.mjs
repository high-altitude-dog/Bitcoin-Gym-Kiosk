// "Pagar con Bitcoin (Bolt12/Ark)" (the BIP321 experiment): a purple fifth payment button to the right of Bitcoin Ark (only when the
// region offers it), one QR holding a BIP 321 URI with an Ark address and a BOLT12 offer, and a paid
// session completing the order once.
import QRCode from "qrcode"
import { ARK_PROVIDER, BIP321_PROVIDER, BIP321_URI, createChecker, createMock, LANDSCAPE, launch, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const toPayment = async (page) => {
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  // Bs 1 + Bs 5: the Bs 6 the mock's session is for, so a live one can be reused.
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-pay:visible")
  await page.waitForSelector(".k-method")
}

// Hidden where the region doesn't offer it, even with Bitcoin Ark on.
{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.arkEnabled = true
  await mock.install(page)
  await toPayment(page)
  check("no BIP321 button without the provider", (await page.$$(".k-method__option")).length === 4 && !(await page.$(".k-method__option--bip321")))
  await ctx.close()
}

for (const [name, viewport] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock()
  mock.arkEnabled = true
  mock.bip321Enabled = true
  await mock.install(page)
  const errors = watchErrors(page)
  await toPayment(page)

  const layout = await page.evaluate(() => {
    const stage = document.querySelector(".k-stage").getBoundingClientRect()
    const buttons = [...document.querySelectorAll(".k-method__option, .k-method__back")].map((b) => b.getBoundingClientRect())
    const inside = buttons.every((r) => r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1)
    const apart = buttons.every((a, i) => buttons.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top))
    const options = [...document.querySelectorAll(".k-method__option")]
    const bip = document.querySelector(".k-method__option--bip321")
    const ark = document.querySelector(".k-method__option--ark")
    return {
      inside,
      apart,
      labels: options.map((o) => o.textContent),
      afterArk: options.at(-1) === bip && options.at(-2) === ark,
      bg: getComputedStyle(bip).backgroundColor,
      fits: options.every((o) => o.scrollWidth <= o.clientWidth + 1 && o.scrollHeight <= o.clientHeight + 1),
    }
  })
  check(`${name}: five options, BIP321 last (after Ark), purple`, layout.labels.length === 5 && layout.afterArk && layout.labels.at(-1) === "Pagar con Bitcoin (Bolt12/Ark)" && layout.bg === "rgb(123, 63, 228)", JSON.stringify(layout))
  check(`${name}: buttons inside the stage, not overlapping, text fits`, layout.inside && layout.apart && layout.fits, JSON.stringify(layout))
  await page.screenshot({ path: `${SHOTS}/bip321-method-${name}.png` })

  await page.click(".k-method__option--bip321")
  await page.waitForSelector(".payment-qr", { timeout: 10000 })
  const shown = await page.evaluate(() => ({
    src: document.querySelector(".payment-qr").getAttribute("src"),
    mark: document.querySelector(".payment-ark-mark")?.textContent,
    note: [...document.querySelectorAll(".payment-note")].map((n) => n.textContent).join(" | "),
  }))
  // Module by module, as in ark.test.mjs (PNG bytes differ between Node and the browser).
  const { modules } = QRCode.create(BIP321_URI)
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
  check(`${name}: a BIP321 session was created`, mock.sessionProviders.at(-1) === BIP321_PROVIDER, JSON.stringify(mock.sessionProviders))
  check(`${name}: the QR holds the BIP 321 URI (Ark + BOLT12)`, onScreen === expected, `${modules.size}x${modules.size}`)
  check(`${name}: BIP321 mark and the Ark-or-Bolt12 note`, shown.mark === "Bitcoin (Bolt12/Ark)" && /Ark o Bolt12/.test(shown.note), JSON.stringify({ ...shown, src: undefined }))
  await page.screenshot({ path: `${SHOTS}/bip321-qr-${name}.png` })

  if (name === "portrait") {
    // Cancel, then Bitcoin Ark: a different method gets its own session; back to BIP321 makes a new one too.
    await page.click(".back-button")
    await page.waitForSelector(".k-method")
    await page.click(".k-method__option--bip321")
    await page.waitForSelector(".payment-qr")
    check("Cancelar then BIP321 again reuses the live session", mock.sessionProviders.filter((p) => p === BIP321_PROVIDER).length === 1, JSON.stringify(mock.sessionProviders))
    await page.click(".back-button")
    await page.waitForSelector(".k-method")
    await page.click(".k-method__option--ark")
    await page.waitForSelector(".payment-ark-mark")
    check("Bitcoin Ark after BIP321 creates an Ark session", mock.sessionProviders.at(-1) === ARK_PROVIDER, JSON.stringify(mock.sessionProviders))
    await page.click(".back-button")
    await page.waitForSelector(".k-method")
    await page.click(".k-method__option--bip321")
    await page.waitForFunction(() => document.querySelector(".payment-ark-mark")?.textContent === "Bitcoin (Bolt12/Ark)")

    mock.orderItems = [{ id: "i1", quantity: 1, title: "Banana", product_title: "Banana", thumbnail: null, product_type: "Autoservicio" }]
    mock.paid = true
    await page.waitForSelector(".done-new", { timeout: 10000 })
    await page.waitForTimeout(1500)
    const completes = mock.calls.filter((c) => c === "POST /store/carts/cart_1/complete").length
    check("a paid BIP321 session completes the order once", completes === 1 && (await page.textContent(".done-title")) === "¡Gracias!", `completes=${completes}`)
  }
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
