import { planPriceNormalization, PriceRow } from "../price-normalize"

const plain = (amount: number, updated_at = "2026-10-01"): PriceRow => ({ id: "p" + amount, currency_code: "bob", amount, updated_at, rules: [] })
const region = (amount: number, updated_at = "2026-10-01"): PriceRow => ({
  id: "r" + amount, currency_code: "bob", amount, updated_at, rules: [{ attribute: "region_id", value: "reg_1" }],
})

describe("planPriceNormalization", () => {
  it("leaves a single plain BOB price alone", () => {
    expect(planPriceNormalization([plain(5)])).toBeNull()
  })

  it("turns a region-only price into the plain price", () => {
    expect(planPriceNormalization([region(7)])).toBe(7)
  })

  it("keeps whichever of the two was edited last", () => {
    expect(planPriceNormalization([plain(5, "2026-10-02"), region(7, "2026-10-01")])).toBe(5)
    expect(planPriceNormalization([plain(5, "2026-10-01"), region(7, "2026-10-02")])).toBe(7)
  })

  it("leaves variants with other currencies or other rules alone", () => {
    expect(planPriceNormalization([plain(5), { ...plain(9), id: "u", currency_code: "usd" }])).toBeNull()
    expect(planPriceNormalization([{ ...region(7), rules: [{ attribute: "customer_group_id", value: "x" }] }])).toBeNull()
  })

  it("leaves a variant with a Price List sale price or a quantity tier entirely alone", () => {
    expect(planPriceNormalization([plain(5), { ...plain(3), price_list_id: "plist_1" }])).toBeNull()
    expect(planPriceNormalization([region(7), { ...plain(3), price_list_id: "plist_1" }])).toBeNull()
    expect(planPriceNormalization([region(7), { ...plain(6), min_quantity: 10 }])).toBeNull()
  })

  it("does nothing when there are no prices", () => {
    expect(planPriceNormalization([])).toBeNull()
  })
})
