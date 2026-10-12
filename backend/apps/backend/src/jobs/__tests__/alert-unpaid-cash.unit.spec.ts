import { findUnpaidCash, UNPAID_AFTER_MINUTES } from "../alert-unpaid-cash"

const now = Date.parse("2026-10-12T15:00:00Z")
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()

describe("findUnpaidCash", () => {
  it("reports an uncaptured cash payment past the grace period", () => {
    expect(
      findUnpaidCash([{ id: "pay_1", payment_collection_id: "pc_1", created_at: minutesAgo(UNPAID_AFTER_MINUTES + 2) }], now)
    ).toEqual([{ paymentId: "pay_1", collectionId: "pc_1", minutesWaiting: UNPAID_AFTER_MINUTES + 2 }])
  })

  it("leaves a member who is still walking to the desk alone", () => {
    expect(findUnpaidCash([{ id: "pay_1", payment_collection_id: "pc_1", created_at: minutesAgo(UNPAID_AFTER_MINUTES - 1) }], now)).toEqual([])
  })

  it("skips captured and cancelled payments", () => {
    const old = minutesAgo(60)
    expect(
      findUnpaidCash(
        [
          { id: "pay_1", payment_collection_id: "pc_1", created_at: old, captured_at: minutesAgo(30) },
          { id: "pay_2", payment_collection_id: "pc_2", created_at: old, canceled_at: minutesAgo(30) },
        ],
        now
      )
    ).toEqual([])
  })
})
