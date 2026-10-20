import { planCashCollect } from "../cash-collect"

const cart = (over: Record<string, unknown> = {}) => ({
  id: "cart_1",
  total: 4,
  sales_channel_id: "sc_gym",
  completed_at: null,
  items: [
    { title: "Default variant", product_title: "Banana", quantity: 2 },
    { title: "Creatine", product_title: null, quantity: 1 },
  ],
  ...over,
})

describe("planCashCollect", () => {
  it("asks the desk to collect the cart's total, with its items", () => {
    expect(planCashCollect(cart(), ["sc_gym"], { attempt: "1792500000000" })).toEqual({
      action: "notify",
      template: "cash-collect",
      data: { total: 4, items: [{ title: "Banana", quantity: 2 }, { title: "Creatine", quantity: 1 }] },
      idempotencyKey: "slack:cash-collect:cart_1:1792500000000",
    })
  })

  it("says not to collect it when cancelled, keyed to the same opening", () => {
    const plan = planCashCollect(cart(), ["sc_gym"], { attempt: "17925", cancelled: true })
    expect(plan.action === "notify" && plan.template).toBe("cash-collect-cancelled")
    expect(plan.action === "notify" && plan.idempotencyKey).toBe("slack:cash-collect-cancelled:cart_1:17925")
  })

  it("refuses another channel's cart, a completed or empty cart, and a bad attempt id", () => {
    expect(planCashCollect(cart({ sales_channel_id: "sc_other" }), ["sc_gym"], { attempt: "1" }).action).toBe("refuse")
    expect(planCashCollect(undefined, ["sc_gym"], { attempt: "1" }).action).toBe("refuse")
    expect(planCashCollect(cart({ completed_at: new Date().toISOString() }), ["sc_gym"], { attempt: "1" }).action).toBe("refuse")
    expect(planCashCollect(cart({ items: [] }), ["sc_gym"], { attempt: "1" }).action).toBe("refuse")
    expect(planCashCollect(cart(), ["sc_gym"], {}).action).toBe("refuse")
    expect(planCashCollect(cart(), ["sc_gym"], { attempt: "x".repeat(40) }).action).toBe("refuse")
    expect(planCashCollect(cart(), ["sc_gym"], { attempt: "a b" }).action).toBe("refuse")
  })
})
