import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductTypesWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
  updateSalesChannelsWorkflow,
  updateShippingProfilesWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { COINOS_LIGHTNING_PROVIDER_ID } from "../modules/coinos-lightning/types";
import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types";
import { BARK_ARK_PROVIDER_ID } from "../modules/bark-ark/types";
import { FULFILLMENT_TYPES } from "../lib/fulfillment-mode";
import { findGymStockLocation } from "../lib/gym-stock-location";

const GYM_NAME = "Armor Gym";
const REGION_NAME = "Bolivia";
// pp_system_default backs the bank QR "Pagado" stand-in until Baneco exists.
const REGION_PAYMENT_PROVIDERS = [
  "pp_system_default",
  COINOS_LIGHTNING_PROVIDER_ID,
  CASH_PAYMENT_PROVIDER_ID,
  // Only registered where Bark Pay is configured (medusa-config.ts).
  ...(process.env.BARKPAY_API_KEY ? [BARK_ARK_PROVIDER_ID] : []),
];
// The kiosk sales channel and the default shipping profile are both named
// after the gym, so staff see a single "Armor Gym" in the product form. The
// channel was called "Armor Gym Kiosk" until Oct 9, 2026; it is renamed in place.
const CHANNEL_NAME = GYM_NAME;
const LEGACY_CHANNEL_NAME = `${GYM_NAME} Kiosk`;

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

  // Region: Bolivia, BOB. Baneco is added once built.
  let region = await find("region", { name: REGION_NAME });
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: "bob",
            countries: ["bo"],
            payment_providers: [...REGION_PAYMENT_PROVIDERS],
          },
        ],
      },
    });
    region = result[0];
    logger.info(`Created region ${REGION_NAME} (BOB).`);
  } else {
    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "payment_providers.id"],
      filters: { id: region.id },
    });
    const currentProviders = (regions[0] as { payment_providers: { id: string }[] })
      .payment_providers.map((p) => p.id);
    const missing = REGION_PAYMENT_PROVIDERS.filter((id) => !currentProviders.includes(id));
    if (missing.length) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: { payment_providers: [...currentProviders, ...missing] },
        },
      });
      logger.info(`Enabled ${missing.join(", ")} on region ${REGION_NAME}.`);
    }
  }

  if (!(await find("tax_region", { country_code: "bo" }))) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "bo", provider_id: "tp_system" }],
    });
  }

  // Kiosk sales channel: found (or renamed) first, so the stock location can be
  // found through it. Created further down if missing.
  let channel = await find("sales_channel", { name: CHANNEL_NAME });
  if (!channel) {
    const legacy = await find("sales_channel", { name: LEGACY_CHANNEL_NAME });
    if (legacy) {
      await updateSalesChannelsWorkflow(container).run({
        input: { selector: { id: legacy.id }, update: { name: CHANNEL_NAME } },
      });
      channel = legacy;
      logger.info(`Renamed sales channel ${LEGACY_CHANNEL_NAME} to ${CHANNEL_NAME}.`);
    }
  }

  // Stock location: the one the kiosk channel sells from, whatever staff have
  // renamed it to. Only a database without one gets a new one, named after the gym.
  let stockLocation: { id: string; name?: string } | undefined = await findGymStockLocation(
    container,
    channel?.id,
    GYM_NAME
  );
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
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          { name: CHANNEL_NAME, description: `Kiosk tablet at ${GYM_NAME}` },
        ],
      },
    });
    channel = result[0];
    logger.info(`Created sales channel ${CHANNEL_NAME}.`);
  }
  const { data: channelLocations } = await query.graph({
    entity: "sales_channel",
    fields: ["stock_locations.id"],
    filters: { id: channel.id },
  });
  const linkedIds = ((channelLocations[0] as { stock_locations?: ({ id: string } | null)[] } | undefined)
    ?.stock_locations ?? []).map((l) => l?.id);
  if (!linkedIds.includes(stockLocation.id)) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [channel.id] },
    });
    logger.info(`Linked sales channel ${CHANNEL_NAME} to its stock location.`);
  }

  // Publishable API key for the kiosk storefront, scoped to this channel.
  const KIOSK_KEY_TITLE = `${LEGACY_CHANNEL_NAME} storefront`; // the key keeps its original title
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token", "sales_channels.id"],
    filters: { title: KIOSK_KEY_TITLE, type: "publishable" },
  });
  let apiKey = existingKeys[0] as
    | { id: string; token: string; sales_channels: { id: string }[] }
    | undefined;
  if (!apiKey) {
    const { data: users } = await query.graph({ entity: "user", fields: ["id"] });
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          { title: KIOSK_KEY_TITLE, type: "publishable", created_by: users[0].id },
        ],
      },
    });
    apiKey = { ...result[0], sales_channels: [] };
    logger.info(`Created publishable API key "${KIOSK_KEY_TITLE}".`);
  }
  if (!apiKey.sales_channels.some((c) => c.id === channel.id)) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: apiKey.id, add: [channel.id] },
    });
    logger.info(`Linked sales channel ${CHANNEL_NAME} to the kiosk publishable key.`);
  }
  logger.info(`Kiosk publishable key token: ${apiKey.token}`);

  // The default shipping profile is named after the gym too (Medusa's own
  // name is "Default Shipping Profile"). Every product uses this one.
  const { data: allProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  });
  const defaultProfile = (allProfiles as { id: string; name: string; type: string }[]).find((p) => p.type === "default");
  if (defaultProfile && defaultProfile.name !== GYM_NAME) {
    await updateShippingProfilesWorkflow(container).run({
      input: { selector: { id: defaultProfile.id }, update: { name: GYM_NAME } },
    });
    logger.info(`Renamed shipping profile ${defaultProfile.name} to ${GYM_NAME}.`);
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

  // A product with no shipping profile fails checkout with "shipping
  // profiles not satisfied" even though the pickup option exists.
  const { data: profilelessProducts } = await query.graph({
    entity: "product",
    fields: ["id", "shipping_profile.id"],
  });
  const missingProfile = (
    profilelessProducts as { id: string; shipping_profile: { id: string } | null }[]
  ).filter((p) => !p.shipping_profile);
  if (missingProfile.length) {
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    });
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: missingProfile.map((p) => p.id) },
        update: { shipping_profile_id: profiles[0].id },
      },
    });
    logger.info(
      `Linked ${missingProfile.length} product(s) to the default shipping profile.`
    );
  }

  // Product types choose how each product is handed over (see
  // lib/fulfillment-mode.ts). Staff pick one from the product's Type field in
  // the admin; a product with no type is treated as self-serve.
  const { data: existingTypes } = await query.graph({
    entity: "product_type",
    fields: ["value"],
  });
  const haveTypes = new Set((existingTypes as { value: string }[]).map((t) => t.value));
  const missingTypes = Object.values(FULFILLMENT_TYPES).filter((v) => !haveTypes.has(v));
  if (missingTypes.length) {
    await createProductTypesWorkflow(container).run({
      input: { product_types: missingTypes.map((value) => ({ value })) },
    });
    logger.info(`Created product type(s): ${missingTypes.join(", ")}.`);
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
