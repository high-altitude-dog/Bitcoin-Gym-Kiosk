import { findStuckPayments, STUCK_AFTER_MINUTES } from "../alert-paid-without-order"

describe("findStuckPayments", () => {
  const now = Date.parse("2026-10-04T12:00:00Z")
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()
  const session = (id: string, collection: string, updatedMinutesAgo: number) => ({
    id,
    amount: 10,
    data: { sats_amount: 1430 },
    payment_collection_id: collection,
    updated_at: minutesAgo(updatedMinutesAgo),
  })

  const carts = new Map([
    ["pc_ordered", "cart_ordered"],
    ["pc_stuck", "cart_stuck"],
    ["pc_recent", "cart_recent"],
  ])

  it("flags only a confirmed payment with no order after the grace period", () => {
    const stuck = findStuckPayments(
      [
        session("ps_ordered", "pc_ordered", 10),
        session("ps_stuck", "pc_stuck", 10),
        session("ps_recent", "pc_recent", STUCK_AFTER_MINUTES - 1),
        session("ps_nocart", "pc_unknown", 10),
      ],
      carts,
      new Set(["cart_ordered"]),
      now
    )
    expect(stuck).toEqual([
      { sessionId: "ps_stuck", cartId: "cart_stuck", amount: 10, sats: 1430, minutesWaiting: 10 },
    ])
  })
})
