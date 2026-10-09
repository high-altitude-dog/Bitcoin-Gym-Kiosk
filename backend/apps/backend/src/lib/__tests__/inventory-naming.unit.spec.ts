import { planInventoryNames, planVariantSkus, NamingVariant } from "../inventory-naming"

const item = (id: string, title: string | null, sku: string | null = null, variantCount = 1) => ({
  id,
  title,
  sku,
  variantCount,
})
const variant = (title: string | null, sku: string | null, items: NamingVariant["items"], id = "v"): NamingVariant => ({
  id,
  title,
  sku,
  items,
})

describe("planInventoryNames", () => {
  it("names a single-variant product's item after the product and fills the SKU from the handle", () => {
    expect(
      planInventoryNames({
        title: "Banana",
        handle: "banana",
        variants: [variant("Default variant", null, [item("i1", "Default variant")])],
      })
    ).toEqual([{ id: "i1", title: "Banana", sku: "BANANA" }])
  })

  it("recognises Medusa's 'Product / Default variant' form", () => {
    expect(
      planInventoryNames({
        title: "Creatine",
        handle: "creatine",
        variants: [variant("Default variant", null, [item("i1", "Creatine / Default variant", "CREA")])],
      })
    ).toEqual([{ id: "i1", title: "Creatine" }])
  })

  it("keeps the variant in the name when there are several, and copies each variant's own SKU", () => {
    expect(
      planInventoryNames({
        title: "Whey",
        handle: "whey",
        variants: [
          variant("Vanilla", null, [item("i1", "Vanilla")]),
          variant("Chocolate", "WHEY-CHOC", [item("i2", "Chocolate")]),
        ],
      })
    ).toEqual([
      // No variant SKU and several variants: leave the SKU empty rather than invent one.
      { id: "i1", title: "Whey / Vanilla" },
      { id: "i2", title: "Whey / Chocolate", sku: "WHEY-CHOC" },
    ])
  })

  it("renames a product-only name once the product gains a second variant", () => {
    expect(
      planInventoryNames({
        title: "Whey",
        handle: "whey",
        variants: [
          variant("Vanilla", "V", [item("i1", "Whey", "V")]),
          variant("Chocolate", "C", [item("i2", "Chocolate", "C")]),
        ],
      })
    ).toEqual([
      { id: "i1", title: "Whey / Vanilla" },
      { id: "i2", title: "Whey / Chocolate" },
    ])
  })

  it("never overwrites a name or SKU someone chose", () => {
    expect(
      planInventoryNames({
        title: "Whey",
        handle: "whey",
        variants: [
          variant("Vanilla", "V", [item("i1", "Proteína vainilla 1kg", "CUSTOM")]),
          variant("Chocolate", "C", [item("i2", "Whey / Chocolate", "C")]),
        ],
      })
    ).toEqual([])
  })

  it("skips bundles and items shared between variants", () => {
    expect(
      planInventoryNames({
        title: "Pack",
        handle: "pack",
        variants: [
          variant("A", null, [item("i1", "A"), item("i2", "A")]),
          variant("B", null, [item("i3", "B", null, 2)]),
        ],
      })
    ).toEqual([])
  })
})

describe("planVariantSkus", () => {
  const product = (variants: NamingVariant[]) => ({ title: "Iced Latte", handle: "iced-latte", variants })

  it("gives a SKU-less variant the SKU its inventory item is about to get", () => {
    const p = product([variant("Default variant", null, [item("i1", "Default variant")], "v1")])
    expect(planVariantSkus(p, planInventoryNames(p))).toEqual([{ id: "v1", sku: "ICED-LATTE" }])
  })

  it("gives a SKU-less variant the SKU its inventory item already has", () => {
    const p = product([variant("Default variant", null, [item("i1", "Iced Latte", "OLD-SKU")], "v1")])
    expect(planVariantSkus(p, [])).toEqual([{ id: "v1", sku: "OLD-SKU" }])
  })

  it("never changes a SKU the variant already has, even when the item differs", () => {
    const p = product([variant("Default variant", "MINE", [item("i1", "Iced Latte", "OTHER")], "v1")])
    expect(planVariantSkus(p, [])).toEqual([])
  })

  it("skips bundles and variants whose item has no SKU", () => {
    const p = product([
      variant("A", null, [item("i1", "A", "S1"), item("i2", "A", "S2")], "v1"),
      variant("B", null, [item("i3", "B", null)], "v2"),
    ])
    expect(planVariantSkus(p, [])).toEqual([])
  })
})
