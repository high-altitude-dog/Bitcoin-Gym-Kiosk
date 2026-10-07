import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { fulfillOrderByType } from "../lib/fulfill-order";

// One-off backfill for orders placed before automatic fulfilment existed:
// fulfils and marks delivered their self-serve items, exactly as a new order
// would be. Staff and café items are left alone and no Slack messages are
// sent. Safe to re-run: already fulfilled quantities are skipped.
export default async function fulfillExistingOrders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status"],
  });
  let fulfilled = 0;
  for (const order of orders as unknown as { id: string; display_id: number; status: string }[]) {
    if (order.status === "canceled") continue;
    try {
      const result = await fulfillOrderByType(container, order.id, { notify: false });
      if (result.autoFulfilled) {
        fulfilled++;
        logger.info(`Order #${order.display_id}: ${result.autoFulfilled} self-serve unit(s) fulfilled and marked delivered.`);
      }
    } catch (e) {
      logger.warn(`Order #${order.display_id} not fulfilled: ${(e as Error).message}`);
    }
  }
  logger.info(`Done: ${fulfilled} order(s) fulfilled.`);
}
