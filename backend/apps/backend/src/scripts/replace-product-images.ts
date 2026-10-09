import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, uploadFilesWorkflow } from "@medusajs/medusa/core-flows";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Replaces a product's photo from a folder of files named after the product's
// handle (banana.webp → the product with handle "banana"): uploads each file,
// then sets it as the product's thumbnail and only image. The old image files
// are not deleted, and each old thumbnail URL is logged so a change can be
// undone by setting that URL back. Folder: IMAGE_DIR env var. Handles with no
// matching product are reported and skipped. Safe to re-run (it uploads again).
//
//   IMAGE_DIR=/path/to/folder npx medusa exec ./src/scripts/replace-product-images.ts
//
// Uploads land in ./static of the folder the script runs from; the running
// server serves .medusa/server/static, so copy new files there too (build.sh
// does it on the next build).
export default async function replaceProductImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const dir = process.env.IMAGE_DIR;
  if (!dir) {
    logger.error("Set IMAGE_DIR to a folder of images named <product handle>.<ext>.");
    return;
  }
  const files = readdirSync(dir).filter((f) => MIME_TYPES[path.extname(f).toLowerCase()]);
  if (!files.length) {
    logger.warn(`No images found in ${dir}.`);
    return;
  }

  for (const file of files) {
    const handle = path.basename(file, path.extname(file));
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "thumbnail"],
      filters: { handle },
    });
    const product = data[0] as { id: string; title: string; thumbnail: string | null } | undefined;
    if (!product) {
      logger.warn(`No product with handle "${handle}" for ${file}: skipped.`);
      continue;
    }
    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: file,
            mimeType: MIME_TYPES[path.extname(file).toLowerCase()],
            content: readFileSync(path.join(dir, file)).toString("base64"),
            access: "public" as const,
          },
        ],
      },
    });
    const url = result[0].url;
    await updateProductsWorkflow(container).run({
      input: { selector: { id: product.id }, update: { thumbnail: url, images: [{ url }] } },
    });
    logger.info(`${product.title}: image replaced. Was ${product.thumbnail ?? "(none)"}, now ${url}`);
  }
}
