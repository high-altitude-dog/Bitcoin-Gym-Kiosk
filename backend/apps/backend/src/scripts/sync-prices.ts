import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { normalizePrices } from "../lib/price-normalize";

// Applies the one-price rule (lib/price-normalize.ts) to every variant: a
// region-only price becomes the plain BOB price, and a variant with both keeps
// the one edited last. Safe to re-run: variants that already have a single
// plain BOB price are left alone.
export default async function syncPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const changed = await normalizePrices(container, {});
  logger.info(`Normalized the price of ${changed} variant(s).`);
}
