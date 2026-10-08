import { planProductDefaults } from "../product-defaults"

const defaults = { shippingProfileId: "sp_1", salesChannelId: "sc_1" }

describe("planProductDefaults", () => {
  it("fills a missing shipping profile and a missing sales channel", () => {
    expect(planProductDefaults([{ id: "p1", shipping_profile: null, sales_channels: [] }], defaults)).toEqual([
      { id: "p1", shipping_profile_id: "sp_1", sales_channel_id: "sc_1" },
    ])
  })

  it("fills only what is missing", () => {
    expect(
      planProductDefaults(
        [
          { id: "p1", shipping_profile: { id: "sp_x" }, sales_channels: [] },
          { id: "p2", shipping_profile: null, sales_channels: [{ id: "sc_x" }] },
        ],
        defaults
      )
    ).toEqual([
      { id: "p1", sales_channel_id: "sc_1" },
      { id: "p2", shipping_profile_id: "sp_1" },
    ])
  })

  it("leaves products that already have both alone, and never replaces a channel", () => {
    expect(
      planProductDefaults([{ id: "p1", shipping_profile: { id: "sp_x" }, sales_channels: [{ id: "sc_x" }] }], defaults)
    ).toEqual([])
  })

  it("does nothing when there is no default to apply", () => {
    expect(
      planProductDefaults([{ id: "p1", shipping_profile: null, sales_channels: null }], {
        shippingProfileId: null,
        salesChannelId: null,
      })
    ).toEqual([])
  })
})
