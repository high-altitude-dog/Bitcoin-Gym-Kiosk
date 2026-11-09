// An invoice request the member abandoned with "Cancelar" must not touch the
// screen when it finally answers (Nov 8, 2026: Bark Pay took 11 s, the member
// cancelled and tapped again, the new QR appeared, and then the old request's
// 404 replaced it with the "invoice failed" error).
import { createChecker, createMock, launch, LANDSCAPE, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

const toMethods = async (page) => {
  await page.goto(server.url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => { const add = document.querySelectorAll(".k-card .k-add"); add[0].click(); add[4].click() })
  await page.waitForTimeout(800)
  await page.click(".k-pay:visible")
  await page.waitForSelector(".k-method")
}
const tapBitcoin = (page) => page.click(".k-method__option >> nth=0")
const cancelWait = async (page) => {
  await page.waitForSelector(".dr-cancel")
  await page.click(".dr-cancel")
  await page.waitForSelector(".k-method")
}

for (const [name, viewport] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  // The abandoned request fails late, after the new one's QR is up.
  {
    const ctx = await browser.newContext({ viewport, serviceWorkers: "block" })
    const page = await ctx.newPage()
    const mock = createMock()
    // As on the VM: the 404 after 12 s, past the 11 s in which a failure is retried.
    mock.sessionScript = [{ delay: 12_000, status: 404 }, { delay: 300 }]
    await mock.install(page)
    const errors = watchErrors(page)
    await toMethods(page)
    await tapBitcoin(page)
    await page.waitForTimeout(1500)
    await cancelWait(page)
    await tapBitcoin(page)
    await page.waitForSelector(".payment-qr", { timeout: 6000 })
    const src = await page.getAttribute(".payment-qr", "src")
    await page.waitForTimeout(10_000) // the first request's 404 lands in here
    check(`${name}: the new QR stays after the cancelled request fails`, !!(await page.$(".payment-qr")) && !(await page.$(".k-method__error")))
    check(`${name}: the same QR image throughout`, (await page.getAttribute(".payment-qr", "src")) === src)
    check(`${name}: two invoice requests, no retry of the cancelled one`, mock.calls.filter((c) => c.endsWith("/payment-sessions")).length === 2)
    const real = errors.filter((e) => !e.includes("status of 404"))
    check(`${name}: no page errors`, real.length === 0, real.join(" | "))
    await ctx.close()
  }

  // The abandoned request succeeds late while the member is on the payment choice.
  {
    const ctx = await browser.newContext({ viewport, serviceWorkers: "block" })
    const page = await ctx.newPage()
    const mock = createMock()
    mock.sessionScript = [{ delay: 3000 }]
    await mock.install(page)
    await toMethods(page)
    await tapBitcoin(page)
    await page.waitForTimeout(1000)
    await cancelWait(page)
    await page.waitForTimeout(4000)
    check(`${name}: a late invoice for a cancelled request doesn't open its QR`, !!(await page.$(".k-method")) && !(await page.$(".payment-qr")) && !(await page.$(".k-method__error")))
    // Tapping again asks for a new invoice (the late one was never shown).
    await tapBitcoin(page)
    await page.waitForSelector(".payment-qr", { timeout: 6000 })
    check(`${name}: tapping again then shows a QR`, mock.calls.filter((c) => c.endsWith("/payment-sessions")).length === 2)
    await ctx.close()
  }
}

await browser.close()
await server.close()
finish()
