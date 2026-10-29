import { findStuckPayments, paidRail, STUCK_AFTER_MINUTES } from "../alert-paid-without-order"

describe("findStuckPayments", () => {
  const now = Date.parse("2026-10-04T12:00:00Z")
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()
  const session = (id: string, collection: string, updatedMinutesAgo: number) => ({
    id,
    provider_id: "pp_coinos-lightning_coinos-lightning",
    amount: 10,
    data: { sats_amount: 1430, bolt11: "lnbc1430n1example" },
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
      { sessionId: "ps_stuck", cartId: "cart_stuck", amount: 10, sats: 1430, minutesWaiting: 10, rail: "Lightning Bolt11 (coinos.io)" },
    ])
  })

  it("names the rail the bitcoin arrived on, and so the wallet to refund from", () => {
    expect(paidRail("pp_coinos-lightning_coinos-lightning", { bolt11: "lnbc1n1x" })).toBe("Lightning Bolt11 (coinos.io)")
    expect(paidRail("pp_coinos-lightning_coinos-lightning", { bolt11: "lno1qx" })).toBe("Lightning Bolt12 (coinos.io)")
    expect(paidRail("pp_bark-ark_bark-ark", { paid_rail: "ark" })).toBe("Ark (Bark Pay, botón Bitcoin Ark)")
    expect(paidRail("pp_bark-ark_bark-ark", { paid_rail: "lightning" })).toBe("Lightning Bolt11 (Bark Pay, botón Bitcoin Ark)")
    expect(paidRail("pp_bark-ark_bark-ark", { paid_rail: null })).toBe("Ark o Lightning, no se sabe cuál (Bark Pay, botón Bitcoin Ark)")
    expect(paidRail("pp_bip321_bip321", { paid_rail: "ark" })).toBe("Ark (Bark Pay, botón BIP321)")
    expect(paidRail("pp_bip321_bip321", { paid_rail: "bolt12" })).toBe("Lightning Bolt12 (coinos.io, botón BIP321)")
    expect(paidRail("pp_bip321_bip321", null)).toBe("Ark o Bolt12, no se sabe cuál (botón BIP321)")
  })
})
