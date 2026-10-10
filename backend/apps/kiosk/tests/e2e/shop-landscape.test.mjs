// Shop screen in landscape: layout, order panel, scroll, and turning with a cart.
import { createChecker, createMock, launch, PORTRAIT, SHOTS, startServer, unblockLandscape, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
await mock.install(page)
const errors = watchErrors(page)
const { check, finish } = createChecker()

await unblockLandscape(page)
const rect = (sel, i = 0) => page.evaluate(([sel, i]) => { const r = document.querySelectorAll(sel)[i]?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null }, [sel, i])
const visibleTitles = () => page.evaluate(() => { const g = document.querySelector(".k-grid").getBoundingClientRect(); return [...document.querySelectorAll(".k-card")].map((c, i) => ({ i, r: c.getBoundingClientRect() })).filter(({ r }) => r.top >= g.top - 1 && r.bottom <= g.bottom + 1).map(({ i }) => i) })

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.setViewportSize({ width: 1920, height: 1200 })
await page.waitForTimeout(600)
{
  const st = await page.evaluate(() => { const c = document.querySelector(".k-idle__cta").getBoundingClientRect(); return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), bg: getComputedStyle(document.querySelector(".k-stage")).backgroundImage } })
  check("idle landscape: landscape wall, pill centred", /wall-idle-landscape/.test(st.bg) && Math.abs(st.x + st.w / 2 - 960) <= 40 && Math.abs(st.y + st.h / 2 - 600) <= 40, JSON.stringify(st))
  await page.screenshot({ path: `${SHOTS}/idle-landscape.png` })
}
await page.setViewportSize({ width: 1200, height: 1920 })
await page.waitForTimeout(400)
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.waitForTimeout(400)

// ---- portrait: the bar is shown, the panel is not
check("portrait: order bar visible, panel hidden", (await rect(".k-bar")) !== null && (await page.locator(".k-bar").isVisible()) && !(await page.locator(".k-panel").isVisible()))
check("portrait: 3 columns", (await page.evaluate(() => getComputedStyle(document.querySelector(".k-grid")).gridTemplateColumns.split(" ").length)) === 3)
await page.screenshot({ path: `${SHOTS}/portrait-empty.png` })

// scroll to the third row (cards 6-8) in portrait
await page.evaluate(() => { const g = document.querySelector(".k-grid"); const c = g.querySelectorAll(".k-card")[6]; g.scrollTo({ top: c.offsetTop - 121, behavior: "instant" }) })
await page.waitForTimeout(500)
const callsBefore = mock.calls.length

// ---- turn to landscape (empty order)
await page.setViewportSize({ width: 1920, height: 1200 })
await page.waitForTimeout(800)
check("landscape: panel visible, bar hidden", (await page.locator(".k-panel").isVisible()) && !(await page.locator(".k-bar").isVisible()))
check("landscape: 4 columns", (await page.evaluate(() => getComputedStyle(document.querySelector(".k-grid")).gridTemplateColumns.split(" ").length)) === 4)
const grid = await rect(".k-grid"), panel = await rect(".k-panel"), card = await rect(".k-card"), chips = await rect(".k-chips")
console.log("     grid", JSON.stringify(grid), "panel", JSON.stringify(panel), "card", JSON.stringify(card), "chips", JSON.stringify(chips))
check("grid at x32 y196, 1328x972", grid.x === 32 && grid.y === 196 && grid.w === 1328 && grid.h === 972)
check("panel at x1384 y32, 504x1136", panel.x === 1384 && panel.y === 32 && panel.w === 504 && panel.h === 1136)
check("grid ends before the panel", grid.x + grid.w < panel.x)
check("cards 380 px tall", card.h === 380, `${card.w}x${card.h}`)
check("empty panel shows Byte and the prompt", (await page.locator(".k-panel__byte").isVisible()) && /Elige algo para empezar/.test(await page.textContent(".k-panel__empty")))
check("pay disabled while empty", await page.locator(".k-panel__pay").isDisabled())
check("rotating made no API requests", mock.calls.length === callsBefore)
const vis = await visibleTitles()
check("product 6 (first of the portrait row) still in view", vis.includes(6), `visible: ${vis.join(",")}`)
// mid-list slice above and below (70px + fade)
const g2 = await page.evaluate(() => { const g = document.querySelector(".k-grid"); const cs = [...g.querySelectorAll(".k-card")]; const gr = g.getBoundingClientRect(); return { top: g.scrollTop, above: cs.filter((c) => c.getBoundingClientRect().top < gr.top && c.getBoundingClientRect().bottom > gr.top).map((c) => Math.round(c.getBoundingClientRect().bottom - gr.top)), below: cs.filter((c) => c.getBoundingClientRect().top < gr.bottom && c.getBoundingClientRect().bottom > gr.bottom).map((c) => Math.round(gr.bottom - c.getBoundingClientRect().top)) } })
console.log("     slices (px visible of the cut rows) above:", g2.above.join(","), "below:", g2.below.join(","))
check("a slice of the row above and below shows", g2.above.length > 0 && g2.below.length > 0 && g2.above.every((v) => v >= 60 && v <= 80) && g2.below.every((v) => v >= 60 && v <= 80))
const fade = await rect(".k-grid-fade--bottom"), cue = await rect(".k-scroll-cue--down")
check("bottom fade stays left of the panel", fade.x + fade.w <= panel.x, `${fade.x + fade.w} <= ${panel.x}`)
check("chevron centred on the grid, inside the fade strip", Math.abs(cue.x + cue.w / 2 - 696) <= 1 && cue.y >= fade.y - 1 && cue.y + cue.h <= fade.y + fade.h + 1, JSON.stringify(cue) + " fade " + JSON.stringify(fade))
await page.screenshot({ path: `${SHOTS}/landscape-empty.png` })

// ---- add items by card + and see them in the panel
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
await page.waitForSelector(".k-line")
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[1].click())
await page.waitForTimeout(300)
await page.evaluate(() => document.querySelectorAll(".k-line__plus")[0].click())
await page.evaluate(() => document.querySelectorAll(".k-line__plus")[0].click())
await page.waitForTimeout(1800)
const lines = await page.evaluate(() => [...document.querySelectorAll(".k-line")].map((l) => ({ name: l.querySelector(".k-line__name").textContent, qty: l.querySelector(".k-line__qty").textContent, total: l.querySelector(".k-line__total").textContent })))
console.log("     panel lines:", JSON.stringify(lines))
check("panel lists both products with quantities 3 and 1", lines.length === 2 && lines[0].qty === "3" && lines[1].qty === "1")
const cardQty = await page.evaluate(() => [...document.querySelectorAll(".k-card")].map((c) => c.querySelector(".k-stepper__qty")?.textContent).filter(Boolean))
check("cards show the same quantities", cardQty.join(",") === "3,1", cardQty.join(","))
check("panel total + count", /Bs\s*\d/.test(await page.textContent(".k-panel__total")) && /4 productos/.test(await page.textContent(".k-panel__count")), await page.textContent(".k-panel__count"))
check("pay enabled", !(await page.locator(".k-panel__pay").isDisabled()))
await page.screenshot({ path: `${SHOTS}/landscape-order.png` })

// minus in the panel to zero removes the line
await page.evaluate(() => { const l = document.querySelectorAll(".k-line")[1]; l.querySelector(".k-line__minus").click() })
await page.waitForTimeout(1500)
check("minus to 0 removes the line", (await page.locator(".k-line").count()) === 1)

// chevron: scrolls 2 rows in landscape
await page.evaluate(() => document.querySelector(".k-grid").scrollTo({ top: 0, behavior: "instant" }))
await page.waitForTimeout(400)
await page.evaluate(() => document.querySelector(".k-scroll-cue--down").click())
await page.waitForTimeout(1000)
const down = await page.evaluate(() => { const g = document.querySelector(".k-grid"); const cs = g.querySelectorAll(".k-card"); return { top: g.scrollTop, pitch: cs[4].offsetTop - cs[0].offsetTop, max: g.scrollHeight - g.clientHeight } })
check("down chevron scrolls two rows, or to the end (4 columns)", Math.abs(down.top - Math.min(2 * down.pitch, down.max)) <= 2, `${down.top}; 2 rows = ${2 * down.pitch}, end = ${down.max}`)

// ---- back to portrait: cart kept, anchor kept
await page.setViewportSize({ width: 1200, height: 1920 })
await page.waitForTimeout(800)
check("back in portrait: bar visible, panel hidden", (await page.locator(".k-bar").isVisible()) && !(await page.locator(".k-panel").isVisible()))
check("cart kept (3 of the first)", (await page.textContent(".k-stepper__qty")) === "3")
await page.screenshot({ path: `${SHOTS}/portrait-order.png` })
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))

await browser.close()
await server.close()
finish()
