import { awaitsCashPayment, paymentsOf } from "../cash-payment"

describe("awaitsCashPayment", () => {
  it("is true for an authorized, uncaptured cash payment", () => {
    expect(awaitsCashPayment([{ provider_id: "pp_cash_cash", captured_at: null }])).toBe(true)
  })

  it("is false once captured or cancelled", () => {
    expect(awaitsCashPayment([{ provider_id: "pp_cash_cash", captured_at: "2026-10-12T10:00:00Z" }])).toBe(false)
    expect(awaitsCashPayment([{ provider_id: "pp_cash_cash", canceled_at: "2026-10-12T10:00:00Z" }])).toBe(false)
  })

  it("ignores other providers, even uncaptured ones", () => {
    expect(awaitsCashPayment([{ provider_id: "pp_system_default", captured_at: null }])).toBe(false)
    expect(awaitsCashPayment([{ provider_id: "pp_coinos-lightning_coinos-lightning", captured_at: null }])).toBe(false)
    expect(awaitsCashPayment([])).toBe(false)
  })

  it("reads payments across collections, tolerating missing ones", () => {
    expect(
      paymentsOf({ payment_collections: [{ payments: [{ provider_id: "a" }] }, { payments: null }, { payments: [{ provider_id: "b" }] }] })
    ).toEqual([{ provider_id: "a" }, { provider_id: "b" }])
    expect(paymentsOf({})).toEqual([])
  })
})
