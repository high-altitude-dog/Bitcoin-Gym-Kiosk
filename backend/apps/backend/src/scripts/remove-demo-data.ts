import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  deleteApiKeysWorkflow,
  deleteFulfillmentSetsWorkflow,
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  deleteRegionsWorkflow,
  deleteSalesChannelsWorkflow,
  deleteShippingOptionsWorkflow,
  deleteStockLocationsWorkflow,
  deleteTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// Removes the starter's demo data (Europe region, European Warehouse, Medusa
// products, default sales channel). Run setup-armor-gym.ts first.
export default async function removeDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const ids = async (entity: string, filters: Record<string, unknown>) => {
    const { data } = await query.graph({ entity, fields: ["id"], filters });
    return data.map((d: { id: string }) => d.id);
  };
  const one = async (entity: string, filters: Record<string, unknown>) =>
    (await ids(entity, filters))[0] as string | undefined;

  const kioskChannel =
    (await one("sales_channel", { name: "Armor Gym" })) ?? (await one("sales_channel", { name: "Armor Gym Kiosk" }));
  const bolivia = await one("region", { name: "Bolivia" });
  const gym = await one("stock_location", { name: "Armor Gym" });
  if (!kioskChannel || !bolivia || !gym) {
    throw new Error("Run setup-armor-gym.ts first: Armor Gym records are missing.");
  }

  // Point the store and the publishable key at the kiosk before deleting the old defaults.
  const demoChannels = await ids("sales_channel", { name: "Default Sales Channel" });
  const { data: stores } = await query.graph({ entity: "store", fields: ["id"] });
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: stores[0].id },
      update: { default_sales_channel_id: kioskChannel, default_region_id: bolivia },
    },
  });
  for (const keyId of await ids("api_key", { type: "publishable" })) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: keyId, add: [kioskChannel], remove: demoChannels },
    });
  }

  const products = await ids("product", {
    title: ["Medusa T-Shirt", "Medusa Sweatshirt", "Medusa Sweatpants", "Medusa Shorts"],
  });
  if (products.length) {
    const inventory = container.resolve(Modules.INVENTORY);
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["inventory_items.inventory_item_id"],
      filters: { product_id: products },
    });
    const invIds = [
      ...new Set(
        variants.flatMap((v: any) => (v.inventory_items ?? []).map((i: any) => i.inventory_item_id))
      ),
    ] as string[];
    await deleteProductsWorkflow(container).run({ input: { ids: products } });
    if (invIds.length) await inventory.deleteInventoryItems(invIds);
    logger.info(`Deleted ${products.length} demo products.`);
  }

  const categories = await ids("product_category", {
    name: ["Shirts", "Sweatshirts", "Pants", "Merch"],
  });
  if (categories.length) {
    await deleteProductCategoriesWorkflow(container).run({ input: categories });
  }

  const options = await ids("shipping_option", { name: ["Standard Shipping", "Express Shipping"] });
  if (options.length) await deleteShippingOptionsWorkflow(container).run({ input: { ids: options } });

  const demoLocation = await ids("stock_location", { name: "European Warehouse" });
  if (demoLocation.length) {
    const fulfillment = await ids("fulfillment_set", { name: "European Warehouse delivery" });
    if (fulfillment.length) await deleteFulfillmentSetsWorkflow(container).run({ input: { ids: fulfillment } });
    await deleteStockLocationsWorkflow(container).run({ input: { ids: demoLocation } });
  }

  const europe = await ids("region", { name: "Europe" });
  if (europe.length) await deleteRegionsWorkflow(container).run({ input: { ids: europe } });

  const taxRegions = await ids("tax_region", {
    country_code: ["gb", "de", "dk", "se", "fr", "es", "it"],
  });
  if (taxRegions.length) await deleteTaxRegionsWorkflow(container).run({ input: { ids: taxRegions } });

  if (demoChannels.length) {
    await deleteSalesChannelsWorkflow(container).run({ input: { ids: demoChannels } });
  }

  logger.info("Demo data removed.");
}
