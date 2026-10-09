import { planInventoryManagement } from "../inventory-managed"

describe("planInventoryManagement", () => {
  it("picks only the variants that don't manage inventory yet", () => {
    expect(
      planInventoryManagement([
        { id: "v1", manage_inventory: false },
        { id: "v2", manage_inventory: true },
        { id: "v3", manage_inventory: null },
      ])
    ).toEqual(["v1", "v3"])
  })

  it("does nothing when every variant already manages inventory", () => {
    expect(planInventoryManagement([{ id: "v1", manage_inventory: true }])).toEqual([])
  })
})
