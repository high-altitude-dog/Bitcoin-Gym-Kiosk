import { decideCashAutoCapture } from "../cash-auto-capture"

const now = Date.parse("2026-10-20T15:00:00Z")
const order = (over: Record<string, unknown> = {}) => ({
  id: "order_1",
  status: "pending",
  sales_channel_id: "sc_gym",
  created_at: new Date(now - 20_000).toISOString(),
  payment_collections: [{ payments: [{ id: "pay_1", provider_id: "pp_cash_cash", captured_at: null, canceled_at: null }] }],
  ...over,
})

describe("decideCashAutoCapture", () => {
  it("captures a fresh, uncaptured cash order in the kiosk's channel", () => {
    expect(decideCashAutoCapture(order(), ["sc_gym"], now)).toEqual({ action: "capture", paymentId: "pay_1" })
  })

  it("refuses an order from another sales channel, or none", () => {
    expect(decideCashAutoCapture(order({ sales_channel_id: "sc_other" }), ["sc_gym"], now).action).toBe("refuse")
    expect(decideCashAutoCapture(undefined, ["sc_gym"], now).action).toBe("refuse")
  })

  it("refuses a cancelled order, a non-cash order and an old one", () => {
    expect(decideCashAutoCapture(order({ status: "canceled" }), ["sc_gym"], now).action).toBe("refuse")
    expect(
      decideCashAutoCapture(
        order({ payment_collections: [{ payments: [{ id: "pay_2", provider_id: "pp_system_default", captured_at: null }] }] }),
        ["sc_gym"],
        now
      ).action
    ).toBe("refuse")
    expect(decideCashAutoCapture(order({ created_at: new Date(now - 6 * 60_000).toISOString() }), ["sc_gym"], now).action).toBe("refuse")
  })

  it("reports an already captured cash payment instead of capturing again", () => {
    const captured = order({ payment_collections: [{ payments: [{ id: "pay_1", provider_id: "pp_cash_cash", captured_at: new Date(now).toISOString() }] }] })
    expect(decideCashAutoCapture(captured, ["sc_gym"], now)).toEqual({ action: "already-captured" })
  })
})
