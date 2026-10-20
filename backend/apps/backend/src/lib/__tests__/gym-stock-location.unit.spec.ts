import { pickGymStockLocation } from "../gym-stock-location"

const calacoto = { id: "sloc_1", name: "Calacoto" }
const armorGym = { id: "sloc_2", name: "Armor Gym" }

describe("pickGymStockLocation", () => {
  it("uses the channel's location whatever it is called, even when another has the gym's name", () => {
    expect(pickGymStockLocation([calacoto], [armorGym], "Armor Gym")).toBe(calacoto)
  })

  it("falls back to the gym's name when the channel has no location", () => {
    expect(pickGymStockLocation([], [armorGym], "Armor Gym")).toBe(armorGym)
  })

  it("finds nothing on a fresh database", () => {
    expect(pickGymStockLocation([], [], "Armor Gym")).toBeUndefined()
  })

  it("prefers the gym's name when the channel sells from several locations", () => {
    expect(pickGymStockLocation([calacoto, armorGym], [armorGym], "Armor Gym")).toBe(armorGym)
  })

  it("refuses to guess between several locations none of which has the gym's name", () => {
    expect(() => pickGymStockLocation([calacoto, { id: "sloc_3", name: "Sopocachi" }], [], "Armor Gym")).toThrow(
      /2 stock locations \(Calacoto, Sopocachi\)/
    )
  })
})
