// Shop grid order: sold-out products come last, in "Todo" and inside a category, and stock that sells out
// between members moves the product to the end on the next start.
import { createChecker, createMock, launch, PORTRAIT, startServer, watchErrors } from "./support.mjs"

const server = await startServer()
const browser = await launch()
const ctx = await browser.newContext({ viewport: PORTRAIT, serviceWorkers: "block" })
const page = await ctx.newPage()
const mock = createMock()
const soldOut = (i) => { mock.products[i].variants[0].inventory_quantity = 0 }
soldOut(0)
soldOut(2)
mock.categories = [{ id: "cat_fruit", name: "Fruta", rank: 0, parent_category_id: null }]
for (const i of [1, 2, 3]) mock.products[i].categories = [{ id: "cat_fruit" }]
await mock.install(page)
const errors = watchErrors(page)
const { check, finish } = createChecker()
const titles = (indexes) => indexes.map((i) => mock.products[i].title)
const shown = () => page.evaluate(() => [...document.querySelectorAll(".k-card")].map((c) => c.querySelector(".k-card__name").textContent))
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const inStock = (except) => mock.products.map((_, i) => i).filter((i) => !except.includes(i))

await page.goto(server.url)
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")

// ---- "Todo": in-stock products in Medusa's order, then the sold-out ones in theirs
{
  const want = titles([...inStock([0, 2]), 0, 2])
  const got = await shown()
  check("Todo: sold-out products last, the rest in Medusa's order", sameList(got, want), got.slice(-3).join(" | "))
  const agotado = await page.evaluate(() => [...document.querySelectorAll(".k-card")].map((c) => c.classList.contains("k-card--sold-out")))
  check("Todo: only the last two cards are sold out", agotado.lastIndexOf(false) === agotado.length - 3 && agotado.slice(-2).every(Boolean))
}

// ---- inside a category
await page.click(".k-chip:has-text('Fruta')")
await page.waitForTimeout(200)
{
  const got = await shown()
  check("Fruta: the sold-out product last", sameList(got, titles([1, 3, 2])), got.join(" | "))
}
await page.click(".k-chip:has-text('Todo')")
await page.waitForTimeout(200)

// ---- a product sells out during this member's visit: the grid doesn't move until the next start
mock.orderItems = [{ id: "o1", quantity: 1, title: mock.products[1].title, product_title: mock.products[1].title, thumbnail: null, product_type: "Autoservicio" }]
await page.evaluate(() => document.querySelectorAll(".k-card .k-add")[0].click())
await page.waitForSelector(".k-stepper")
await page.waitForTimeout(1500)
soldOut(1)
{
  const got = await shown()
  check("mid-visit: the grid keeps its order", sameList(got, titles([...inStock([0, 2]), 0, 2])), got[0])
}
await page.click(".k-bar .k-pay")
await page.waitForSelector(".k-method")
await page.click(".k-method__option >> nth=2")
await page.waitForSelector(".bank-qr-paid")
await page.click(".bank-qr-paid")
await page.waitForSelector(".done-new")
await page.evaluate(() => document.querySelector(".done-new").click())
await page.waitForSelector(".k-idle")
await page.click(".k-idle")
await page.waitForSelector(".k-card")
await page.waitForTimeout(300)
{
  const want = titles([...inStock([0, 1, 2]), 0, 1, 2])
  const got = await shown()
  check("next member: the product that sold out moved to the end", sameList(got, want), got.slice(-4).join(" | "))
}

check("no page errors", errors.length === 0, errors.join(" | "))
await browser.close()
await server.close()
finish()
