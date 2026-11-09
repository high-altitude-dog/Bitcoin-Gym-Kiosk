import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";

// The kiosk shows a product's `name_en` metadata as its name in English (and
// its title in Spanish). Staff can set it in the admin (the product's page →
// Metadata, key `name_en`); this script sets it for the catalogue in one go
// (Nov 8, 2026).
//
// By product handle. Only fills `name_en` where it is missing, so a name staff
// changed in the admin is kept; FORCE=yes overwrites. Other metadata keys are
// kept. Prints the plan and changes nothing unless run with CONFIRM=yes:
//   npx medusa exec ./src/scripts/set-product-english-names.ts
//   CONFIRM=yes npx medusa exec ./src/scripts/set-product-english-names.ts
const ENGLISH_NAMES: Record<string, string> = {
  "whey-protein-concentrate-chocolate": "Whey Protein",
  "creatine-monohydrate": "Creatine Monohydrate 3-5g serving",
  banana: "Banana",
  "qkies-galetta": "Qkies Cookie",
  "fruit-drink": "Fruit Drink",
  "whey-protein-1kg": "Whey Protein 1Kg",
  "aventura-chocolate-20g": "Aventura Chocolate 20g",
  "whey-protein-isolate-1kg": "Whey Protein Isolate 1Kg",
  "iced-late-single": "Iced Latte - Single",
  "iced-late-double": "Iced Latte - Double",
  "mio-acai": "Mio - Acai",
  "mio-limonada": "Mio Lemonade",
  "botella-recargable": "Refillable Bottle",
  "pre-workout-fresa-300g": "Strawberry Pre-workout 300g",
  "pre-workout-fruta-300g": "Fruit Pre-workout 300g",
  "water-refill": "Water Refill",
  "gomita-mogul": "Mogul Gummies",
  "postre-proteico": "Protein Dessert",
  "whey90-25g-proteina": "Whey90 (25g Protein)",
  "snack-proteicos": "Protein Snacks",
  "plato-de-croquetas": "Bowl of Kibble",
  "sesión-de-entrenamiento": "Day Pass",
  "un-hueso": "A Bone",
};

export default async function setProductEnglishNames({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const confirm = process.env.CONFIRM === "yes";
  const force = process.env.FORCE === "yes";

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "metadata"],
  });

  const updates: { id: string; metadata: Record<string, unknown> }[] = [];
  for (const product of products) {
    const metadata = (product.metadata ?? {}) as Record<string, unknown>;
    const current = typeof metadata.name_en === "string" ? metadata.name_en : "";
    const wanted = ENGLISH_NAMES[product.handle];
    if (!wanted) {
      logger.info(`  ${product.handle} ("${product.title}"): no English name in this script${current ? `, keeps "${current}"` : ", shows its title in English"}`);
      continue;
    }
    if (current && !force) {
      logger.info(`  ${product.handle}: already "${current}", kept`);
      continue;
    }
    if (current === wanted) continue;
    logger.info(`  ${product.handle}: "${product.title}" → "${wanted}"`);
    updates.push({ id: product.id, metadata: { ...metadata, name_en: wanted } });
  }
  const unknown = Object.keys(ENGLISH_NAMES).filter((h) => !products.some((p) => p.handle === h));
  if (unknown.length) logger.info(`Not in this database: ${unknown.join(", ")}`);

  if (!confirm) {
    logger.info(`Plan only: ${updates.length} product(s) to update. Run with CONFIRM=yes to apply.`);
    return;
  }
  for (const update of updates) {
    await updateProductsWorkflow(container).run({
      input: { selector: { id: update.id }, update: { metadata: update.metadata } },
    });
  }
  logger.info(`Set name_en on ${updates.length} product(s).`);
}
