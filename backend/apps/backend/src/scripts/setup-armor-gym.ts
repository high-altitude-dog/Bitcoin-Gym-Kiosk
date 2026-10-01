import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

const GYM_NAME = "Armor Gym";
const REGION_NAME = "Bolivia";
const CHANNEL_NAME = `${GYM_NAME} Kiosk`;

// Adds the Bolivia region (BOB), this gym's stock location and kiosk sales
// channel. Safe to re-run: each piece is created only if it is missing.
export default async function setupArmorGym({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );

  const find = async (entity: string, filters: Record<string, unknown>) => {
    const { data } = await query.graph({ entity, fields: ["id"], filters });
    return data[0] as { id: string } | undefined;
  };

  // Region: Bolivia, BOB. Coinos and Baneco providers are added once built.
  let region = await find("region", { name: REGION_NAME });
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: "bob",
            countries: ["bo"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = result[0];
    logger.info(`Created region ${REGION_NAME} (BOB).`);
  }

  if (!(await find("tax_region", { country_code: "bo" }))) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "bo", provider_id: "tp_system" }],
    });
  }

  // Stock location named after the gym.
  let stockLocation = await find("stock_location", { name: GYM_NAME });
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          { name: GYM_NAME, address: { city: "", country_code: "BO", address_1: "" } },
        ],
      },
    });
    stockLocation = result[0];
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
    logger.info(`Created stock location ${GYM_NAME}.`);
  }

  // Kiosk sales channel, tied to this gym's stock.
  let channel = await find("sales_channel", { name: CHANNEL_NAME });
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          { name: CHANNEL_NAME, description: `Kiosk tablet at ${GYM_NAME}` },
        ],
      },
    });
    channel = result[0];
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [channel.id] },
    });
    logger.info(`Created sales channel ${CHANNEL_NAME}.`);
  }

  // Free in-gym pickup: a cart needs a shipping option to complete.
  const pickupName = `${GYM_NAME} pickup`;
  if (!(await find("shipping_option", { name: pickupName }))) {
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    });
    const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: `${GYM_NAME} pickup`,
      type: "pickup",
      service_zones: [
        {
          name: "Bolivia",
          geo_zones: [{ country_code: "bo", type: "country" }],
        },
      ],
    });
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: pickupName,
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: profiles[0].id,
          type: {
            label: "Pickup",
            description: "Taken at the gym kiosk.",
            code: "pickup",
          },
          prices: [{ region_id: region.id, amount: 0 }],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
    logger.info(`Created shipping option ${pickupName}.`);
  }

  // Store: support BOB as the default currency, keep the gym's location default.
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code"],
  });
  const store = stores[0] as {
    id: string;
    supported_currencies: { currency_code: string }[];
  };
  const codes = new Set(store.supported_currencies.map((c) => c.currency_code));
  codes.add("bob");
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [...codes].map((currency_code) => ({
          currency_code,
          is_default: currency_code === "bob",
        })),
        default_location_id: stockLocation.id,
      },
    },
  });

  logger.info(`${GYM_NAME} setup complete.`);
}
