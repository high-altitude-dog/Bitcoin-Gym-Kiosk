// "Inicio" at the top right of the shop: back to "Toca para empezar", cart cleared.
import { createChecker, createMock, launch, LANDSCAPE, PORTRAIT, SHOTS, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const { check, finish } = createChecker()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
await mock.install(page)
const errors = watchErrors(page)
const box = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }, sel)

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")

const p = await box(".k-exit"), title = await box(".k-title")
check("portrait: at the top right, level with the greeting, inside the header row", p.x + p.w === 1200 - 64 && p.h === 60 && Math.abs(p.y + p.h / 2 - (title.y + title.h / 2)) <= 4, JSON.stringify({ p, title }))
check("portrait: a visible 'Inicio' pill with a house icon", (await page.textContent(".k-exit")) === "Inicio" && !!(await page.$(".k-exit svg")) && (await page.evaluate(() => getComputedStyle(document.querySelector(".k-exit")).opacity)) === "1")
await page.screenshot({ path: `${SHOTS}/exit-button-portrait.png`, clip: { x: 0, y: 0, width: 1200, height: 220 } })

await page.setViewportSize(LANDSCAPE)
await page.waitForTimeout(400)
const l = await box(".k-exit"), panel = await box(".k-panel"), grid = await box(".k-grid")
check("landscape: at the right end of the greeting row, left of the order panel, over the grid's right edge", l.x + l.w === grid.x + grid.w && l.x + l.w < panel.x, JSON.stringify({ l, panel, grid }))
await page.screenshot({ path: `${SHOTS}/exit-button-landscape.png`, clip: { x: 0, y: 0, width: 1920, height: 220 } })
await page.setViewportSize(PORTRAIT)
await page.waitForTimeout(400)

// With items in the cart: back to the start screen, and the next visit starts empty.
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
await page.waitForSelector(".k-stepper")
await page.waitForTimeout(1200)
await page.click(".k-exit")
const idle = await page.waitForSelector(".k-idle", { timeout: 3000 }).then(() => true, () => false)
check("tapping it goes back to 'Toca para empezar'", idle)
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.waitForTimeout(500)
check("the next visit starts with an empty order", (await page.$$(".k-stepper")).length === 0 && /Elige algo/.test(await page.textContent(".k-bar")), await page.textContent(".k-bar"))
check("no page errors", errors.length === 0, errors.join(" | "))

await browser.close()
await server.close()
finish()
