import { readFileSync } from "node:fs";
import path from "node:path";
import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows";

const GYM_NAME = "Armor Gym";
const REGION_NAME = "Bolivia";
const STOCK_PER_PRODUCT = 21;

/**
 * The real catalogue, captured here so it can be rebuilt from nothing (a
 * fresh database, a redeploy) instead of being recreated by hand through the
 * Admin UI every time — see the "no idempotent script for the product
 * catalog" gap noted in CLAUDE.md. Image files are the ones already checked
 * into `static/` from local dev's own uploads.
 */
const PRODUCTS = [
  {
    title: "Whey Protein Concentrate - Chocolate",
    handle: "whey-protein-concentrate-chocolate",
    priceBs: 10,
    imageFile: "1790826942502-wpc choc.jpg",
  },
  {
    title: "Creatine Monohydrate",
    handle: "creatine-monohydrate",
    priceBs: 3,
    imageFile: "1790827091758-creatine scoop.jpg",
  },
  {
    title: "Banana",
    handle: "banana",
    priceBs: 1,
    imageFile: "1790827204223-banana.jpg",
  },
] as const;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Creates the real product catalogue (region-priced in Bs, managed inventory
// at the Armor Gym stock location, images uploaded from static/). Safe to
// re-run: any product whose handle already exists is left untouched and
// skipped, exactly like setup-armor-gym.ts does for everything else.
//
// Run it from backend/apps/backend (as the runbook says), then
// ./scripts/build.sh: uploads are written to ./static, relative to where the
// script runs, but the deployed server serves .medusa/server/static, and
// build.sh is what copies them across. Run it against an already-built
// server and the images 404 until build.sh runs again.
export default async function createArmorGymProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const find = async (entity: string, filters: Record<string, unknown>) => {
    const { data } = await query.graph({ entity, fields: ["id"], filters });
    return data[0] as { id: string } | undefined;
  };

  const region = await find("region", { name: REGION_NAME });
  const stockLocation = await find("stock_location", { name: GYM_NAME });
  const channel = await find("sales_channel", { name: `${GYM_NAME} Kiosk` });
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  if (!region || !stockLocation || !channel || !shippingProfile) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Region, stock location, sales channel or shipping profile not found. Run setup-armor-gym.ts first."
    );
  }

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: PRODUCTS.map((p) => p.handle) },
  });
  const existingHandles = new Set(existing.map((p) => p.handle));
  const toCreate = PRODUCTS.filter((p) => !existingHandles.has(p.handle));

  if (toCreate.length) {
    // Upload each product's image from static/ first, so product creation
    // below can reference the resulting URL directly as the thumbnail.
    const uploaded = await uploadFilesWorkflow(container).run({
      input: {
        files: toCreate.map((p) => {
          const filePath = path.join(process.cwd(), "static", p.imageFile);
          const ext = path.extname(p.imageFile).toLowerCase();
          return {
            filename: p.imageFile,
            mimeType: MIME_TYPES[ext] ?? "application/octet-stream",
            content: readFileSync(filePath).toString("base64"),
            access: "public" as const,
          };
        }),
      },
    });
    const urlByHandle = new Map(toCreate.map((p, i) => [p.handle, uploaded.result[i].url]));

    const { result: created } = await createProductsWorkflow(container).run({
      input: {
        products: toCreate.map((p) => {
          const imageUrl = urlByHandle.get(p.handle)!;
          return {
            title: p.title,
            handle: p.handle,
            status: ProductStatus.PUBLISHED,
            thumbnail: imageUrl,
            images: [{ url: imageUrl }],
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: channel.id }],
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: "Default Variant",
                sku: p.handle.toUpperCase(),
                manage_inventory: true,
                options: { Default: "Default" },
                prices: [
                  {
                    currency_code: "bob",
                    amount: p.priceBs,
                    rules: { region_id: region.id },
                  },
                ],
              },
            ],
          };
        }),
      },
    });
    logger.info(`Created ${created.length} product(s): ${created.map((p) => p.title).join(", ")}`);
  } else {
    logger.info("Every product in the catalogue already exists.");
  }

  // Stock: 21 units per catalogue product at this gym's location
  // (createProductsWorkflow already created a default inventory item per
  // variant, since manage_inventory is true). Checks every catalogue product,
  // not just ones created above, so a run that failed after creating products
  // still gets them stocked on the next run. Only adds a missing level, never
  // overwrites one: staff may have changed the count since.
  const { data: catalogue } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: PRODUCTS.map((p) => p.handle) },
  });
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["inventory_items.inventory_item_id"],
    filters: { product_id: catalogue.map((p) => p.id) },
  });
  const inventoryItemIds = variants.flatMap(
    (v: any) => (v.inventory_items ?? []).map((i: any) => i.inventory_item_id)
  ) as string[];

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id"],
    filters: { inventory_item_id: inventoryItemIds, location_id: stockLocation.id },
  });
  const stocked = new Set(levels.map((l) => l.inventory_item_id));
  const missing = inventoryItemIds.filter((id) => !stocked.has(id));
  if (!missing.length) {
    logger.info(`Every catalogue product already has stock at ${GYM_NAME}. Nothing to do.`);
    return;
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: missing.map((inventory_item_id) => ({
        inventory_item_id,
        location_id: stockLocation.id,
        stocked_quantity: STOCK_PER_PRODUCT,
      })),
    },
  });
  logger.info(`Stocked ${missing.length} variant(s) with ${STOCK_PER_PRODUCT} units at ${GYM_NAME}.`);
}
