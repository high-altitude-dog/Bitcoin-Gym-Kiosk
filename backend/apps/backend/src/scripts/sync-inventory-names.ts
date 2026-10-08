import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { syncInventoryNames } from "../lib/inventory-naming";

// Applies the inventory naming rule (lib/inventory-naming.ts) to every
// product, for items created before the product subscriber existed or while
// it wasn't listening. Safe to re-run: it only changes names Medusa generated
// and fills missing SKUs.
export default async function syncAll({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({ entity: "product", fields: ["id"] });
  const changed = await syncInventoryNames(container, products.map((p) => p.id));
  logger.info(`Named ${changed} inventory item(s) across ${products.length} product(s).`);
}
