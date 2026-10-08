import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateInventoryItemsWorkflow } from "@medusajs/medusa/core-flows"

// Medusa names each variant's default inventory item after the variant alone
// ("Default variant", "Vanilla"), so the admin's Inventory page can't tell
// products apart. This renames those items after their product:
//   one variant  → "Whey Protein"
//   several      → "Whey Protein / Vanilla"
// Only names Medusa (or this code) generated are changed; a name staff or an
// API caller chose is kept. Variants themselves are never modified, and an
// item's description (where Medusa also copies the variant title) is left
// alone. A missing SKU is filled from the variant's SKU, or from the product
// handle when the product has one variant; otherwise it stays empty.

export type NamingVariant = {
  title: string | null
  sku: string | null
  // Inventory items linked to this variant. More than one means a bundle
  // (each item is a component with its own name), so those are skipped.
  items: { id: string; title: string | null; sku: string | null; variantCount: number }[]
}

export type NamingProduct = {
  title: string
  handle: string
  variants: NamingVariant[]
}

export type InventoryNameUpdate = { id: string; title?: string; sku?: string }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()

export function planInventoryNames(product: NamingProduct): InventoryNameUpdate[] {
  const single = product.variants.length === 1
  const p = norm(product.title)
  const updates: InventoryNameUpdate[] = []

  for (const variant of product.variants) {
    if (variant.items.length !== 1) continue
    const item = variant.items[0]
    // An item shared with another variant or product isn't this variant's own.
    if (item.variantCount > 1) continue

    const v = norm(variant.title)
    const target = single || !v ? product.title : `${product.title} / ${variant.title!.trim()}`
    const generated = new Set(["", v, "default variant", p, `${p} / ${v}`, `${p} / default variant`])

    const update: InventoryNameUpdate = { id: item.id }
    if (generated.has(norm(item.title)) && item.title !== target) update.title = target
    if (!item.sku) {
      const sku = variant.sku || (single ? product.handle.toUpperCase() : null)
      if (sku) update.sku = sku
    }
    if (update.title !== undefined || update.sku !== undefined) updates.push(update)
  }
  return updates
}

/** Applies planInventoryNames to the given products. Returns how many items changed. */
export async function syncInventoryNames(container: MedusaContainer, productIds: string[]): Promise<number> {
  if (!productIds.length) return 0
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "title",
      "handle",
      "variants.title",
      "variants.sku",
      "variants.inventory_items.inventory.id",
      "variants.inventory_items.inventory.title",
      "variants.inventory_items.inventory.sku",
    ],
    filters: { id: productIds },
  })

  // How many variants each inventory item is linked to, across all products.
  const itemIds = (products as any[]).flatMap((p) =>
    (p.variants ?? []).flatMap((v: any) => (v.inventory_items ?? []).map((l: any) => l.inventory?.id).filter(Boolean))
  ) as string[]
  if (!itemIds.length) return 0
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["inventory_item_id"],
    filters: { inventory_item_id: itemIds },
  })
  const linkCount = new Map<string, number>()
  for (const l of links as any[]) linkCount.set(l.inventory_item_id, (linkCount.get(l.inventory_item_id) ?? 0) + 1)

  const updates = (products as any[]).flatMap((p) =>
    planInventoryNames({
      title: p.title,
      handle: p.handle,
      variants: (p.variants ?? []).map((v: any) => ({
        title: v.title,
        sku: v.sku,
        items: (v.inventory_items ?? [])
          .filter((l: any) => l.inventory)
          .map((l: any) => ({
            id: l.inventory.id,
            title: l.inventory.title,
            sku: l.inventory.sku,
            variantCount: linkCount.get(l.inventory.id) ?? 1,
          })),
      })),
    })
  )

  // One at a time, so a SKU already used elsewhere (SKUs are unique) only
  // costs that item its SKU, not everyone their rename.
  let changed = 0
  for (const update of updates) {
    try {
      await updateInventoryItemsWorkflow(container).run({ input: { updates: [update] } })
      changed++
    } catch (e) {
      if (update.sku !== undefined && update.title !== undefined) {
        try {
          await updateInventoryItemsWorkflow(container).run({ input: { updates: [{ id: update.id, title: update.title }] } })
          changed++
          logger.warn(`inventory-naming: renamed ${update.id} but couldn't set SKU ${update.sku}: ${(e as Error).message}`)
          continue
        } catch (e2) {
          e = e2
        }
      }
      logger.warn(`inventory-naming: couldn't update inventory item ${update.id}: ${(e as Error).message}`)
    }
  }
  return changed
}
