import { FULFILLMENT_TYPES, fulfillmentModeOf, planFulfillment } from "../fulfillment-mode"

describe("fulfillment mode by product Type", () => {
  it("maps the three types, ignoring case and spaces", () => {
    expect(fulfillmentModeOf("Autoservicio")).toBe("auto")
    expect(fulfillmentModeOf("entrega del personal")).toBe("staff")
    expect(fulfillmentModeOf(" Café asociado ")).toBe("cafe")
  })

  it("treats no type, or an unknown one, as self-serve", () => {
    expect(fulfillmentModeOf(null)).toBe("auto")
    expect(fulfillmentModeOf(undefined)).toBe("auto")
    expect(fulfillmentModeOf("Bebidas")).toBe("auto")
  })

  it("splits a mixed order and only plans what is still unfulfilled", () => {
    const plan = planFulfillment([
      { id: "a", title: "Banana", quantity: 2, fulfilled_quantity: 0, product_type: null },
      { id: "b", title: "Batido", quantity: 1, fulfilled_quantity: 0, product_type: FULFILLMENT_TYPES.staff },
      { id: "c", title: "Sándwich", quantity: 3, fulfilled_quantity: 1, product_type: FULFILLMENT_TYPES.cafe },
      { id: "d", title: "Creatina", quantity: 1, fulfilled_quantity: 1, product_type: FULFILLMENT_TYPES.auto },
    ])
    expect(plan.auto).toEqual([{ id: "a", title: "Banana", quantity: 2 }])
    expect(plan.staff).toEqual([{ id: "b", title: "Batido", quantity: 1 }])
    expect(plan.cafe).toEqual([{ id: "c", title: "Sándwich", quantity: 2 }])
  })

  it("plans nothing for an order that is already fully fulfilled", () => {
    const plan = planFulfillment([{ id: "a", title: "Banana", quantity: 2, fulfilled_quantity: 2 }])
    expect(plan).toEqual({ auto: [], staff: [], cafe: [] })
  })

  it("refuses a line whose quantity is missing", () => {
    expect(() => planFulfillment([{ id: "a", title: "Banana", quantity: undefined as any, fulfilled_quantity: 0 }])).toThrow("no usable quantity")
  })
})
