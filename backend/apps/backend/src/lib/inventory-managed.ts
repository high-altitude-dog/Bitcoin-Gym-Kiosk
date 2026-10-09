import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

// Every product at the gym is stocked and counted, so a new variant should
// manage its inventory from the start. The admin's create form can't be
// pre-ticked (its defaults are fixed), and a variant without it has no
// inventory item: it never appears on the Inventory page, and the kiosk can't
// count its stock. So a newly created variant that has "Manage inventory" off
// is switched on. This runs on creation only: staff can still untick it later
// for something that really isn't counted. Switching it on makes Medusa create
// the inventory item (with no stock, so the kiosk shows "Agotado" until stock
// is set), and the naming rule in lib/inventory-naming.ts then names it.

export function planInventoryManagement(variants: { id: string; manage_inventory: boolean | null }[]): string[] {
  return variants.filter((v) => !v.manage_inventory).map((v) => v.id)
}

/** Switches on inventory management for the given variants, or for all variants of the given product. Returns how many changed. */
export async function enableInventoryManagement(
  container: MedusaContainer,
  target: { variantId?: string; productId?: string }
): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const filters = target.variantId ? { id: target.variantId } : target.productId ? { product_id: target.productId } : null
  if (!filters) return 0

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory"],
    filters,
  })
  const ids = planInventoryManagement(variants as { id: string; manage_inventory: boolean | null }[])
  if (!ids.length) return 0

  try {
    await updateProductVariantsWorkflow(container).run({
      input: { selector: { id: ids }, update: { manage_inventory: true } },
    })
    return ids.length
  } catch (e) {
    logger.warn(`inventory-managed: couldn't enable inventory management on ${ids.join(", ")}: ${(e as Error).message}`)
    return 0
  }
}
