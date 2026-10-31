// Bank QR and cash only on a kiosk opened with ?location= (lib/location.ts): without it both buttons are
// greyed out with "Solo en el gimnasio"; with it they work, every request carries the location, and the
// kiosk remembers it after a reload without the parameter.
import { createChecker, createMock, launch, PORTRAIT, startServer } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()

async function toMethods(page, url) {
  await page.goto(url)
  await page.click(".k-idle")
  await page.waitForSelector(".k-card")
  await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
  await page.waitForTimeout(800)
  await page.click(".k-pay:visible")
  await page.waitForSelector(".k-method")
}
const buttons = (page) => page.evaluate(() => ["bank-qr", "cash"].map((m) => {
  const b = document.querySelector(`.k-method__option--${m}`)
  return { disabled: b.disabled, note: b.querySelector(".k-method__only-gym")?.textContent ?? null }
}))

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock(); await mock.install(page)
  await toMethods(page, server.bareUrl)
  const b = await buttons(page)
  check("no location: bank QR and cash greyed out, 'Solo en el gimnasio'", b.every((x) => x.disabled && x.note === "Solo en el gimnasio"), JSON.stringify(b))
  check("no location: Bitcoin still on", await page.locator(".k-method__option >> nth=0").isEnabled())
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
  const page = await ctx.newPage()
  const mock = createMock(); await mock.install(page)
  const headers = []
  page.on("request", (r) => r.url().includes("/store/") && headers.push(r.headers()["x-kiosk-location"] ?? null))
  await toMethods(page, server.url.replace("e2e", "Calacoto"))
  const b = await buttons(page)
  check("with ?location=: bank QR and cash on", b.every((x) => !x.disabled && x.note === null), JSON.stringify(b))
  check("every store request carries the location, lower-cased", headers.length > 0 && headers.every((h) => h === "calacoto"), [...new Set(headers)].join(","))
  await page.goto(server.bareUrl)
  check("remembered after a reload without the parameter", await page.evaluate(() => localStorage.getItem("kiosk-location")) === "calacoto")
  await page.click(".k-idle"); await page.waitForSelector(".k-card")
  await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
  await page.waitForTimeout(800); await page.click(".k-pay:visible"); await page.waitForSelector(".k-method")
  check("... and the buttons stay on", (await buttons(page)).every((x) => !x.disabled))
  await ctx.close()
}

await browser.close()
await server.close()
finish()
