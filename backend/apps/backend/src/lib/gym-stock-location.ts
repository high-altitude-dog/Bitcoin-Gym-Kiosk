import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// The gym's stock location is the one the kiosk's sales channel sells from,
// whatever it is called: staff can rename it in the admin (the VM's has been
// "Calacoto" since Oct 9, 2026). Looking it up by name made setup-armor-gym.ts
// create a second, empty "Armor Gym" location when it was re-run on Oct 12.
// The name is only a fallback, for a database where the channel doesn't exist
// yet or isn't linked to a location.

export type StockLocationRef = { id: string; name: string }

export function pickGymStockLocation(
  linked: StockLocationRef[],
  named: StockLocationRef[],
  fallbackName: string
): StockLocationRef | undefined {
  if (linked.length === 1) return linked[0]
  if (linked.length > 1) {
    const match = linked.find((l) => l.name === fallbackName)
    if (match) return match
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The kiosk's sales channel sells from ${linked.length} stock locations (${linked.map((l) => l.name).join(", ")}), so the gym's can't be told apart.`
    )
  }
  return named[0]
}

export async function findGymStockLocation(
  container: MedusaContainer,
  channelId: string | undefined,
  fallbackName: string
): Promise<StockLocationRef | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  let linked: StockLocationRef[] = []
  if (channelId) {
    const { data } = await query.graph({
      entity: "sales_channel",
      fields: ["stock_locations.id", "stock_locations.name"],
      filters: { id: channelId },
    })
    linked = ((data[0] as { stock_locations?: (StockLocationRef | null)[] } | undefined)?.stock_locations ?? []).filter(
      (l): l is StockLocationRef => !!l
    )
  }
  const { data: named } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: fallbackName },
  })
  return pickGymStockLocation(linked, named as StockLocationRef[], fallbackName)
}
