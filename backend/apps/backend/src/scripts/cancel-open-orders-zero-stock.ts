import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  cancelOrdersStep,
  cancelOrderWorkflow,
  deleteReservationsByLineItemsStep,
  deleteReservationsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows";

// One-off (Oct 19, 2026): set every stock level to 0, then cancel every order
// that still holds a reservation, so no stock and no reservations are left.
// Prints the plan only, unless run with CONFIRM=yes.
//
// Orders Medusa's own cancel refuses are cancelled with Medusa's own steps but
// without the refund: a Lightning payment that was captured (Coinos has no
// refund API, so the provider throws) or an order with a fulfilment (a
// delivered one can't be cancelled). Their payments stay recorded as received.

const forceCancelOrderWorkflow = createWorkflow(
  "force-cancel-order-keep-payment",
  (input: { orderId: string; lineItemIds: string[] }) => {
    deleteReservationsByLineItemsStep(input.lineItemIds);
    const canceled = cancelOrdersStep({ orderIds: [input.orderId] });
    return new WorkflowResponse(canceled);
  }
);

type Order = {
  id: string;
  display_id: number;
  status: string;
  items: { id: string }[] | null;
  fulfillments: { id: string; canceled_at: string | null }[] | null;
  payment_collections: { payments: { provider_id: string; captured_at: string | null; canceled_at: string | null }[] | null }[] | null;
};

export default async function cancelOpenOrdersZeroStock({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const inventory = container.resolve(Modules.INVENTORY);
  const apply = process.env.CONFIRM === "yes";

  // 1. Stock to 0 first, so nothing new can be sold (or reserved) meanwhile.
  const levels = await inventory.listInventoryLevels({}, { take: 10000 });
  const toZero = levels.filter((l) => Number(l.stocked_quantity) !== 0);
  logger.info(`${levels.length} stock level(s), ${toZero.length} not at 0.`);
  if (apply && toZero.length) {
    await updateInventoryLevelsWorkflow(container).run({
      input: { updates: toZero.map((l) => ({ inventory_item_id: l.inventory_item_id, location_id: l.location_id, stocked_quantity: 0 })) },
    });
    logger.info(`Stock set to 0 on ${toZero.length} level(s).`);
  }

  // 2. Cancel every order holding a reservation.
  const reservations = await inventory.listReservationItems({}, { take: 10000 });
  const reservedLines = new Set(reservations.map((r) => r.line_item_id).filter(Boolean) as string[]);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "status", "items.id", "fulfillments.id", "fulfillments.canceled_at",
      "payment_collections.payments.provider_id", "payment_collections.payments.captured_at", "payment_collections.payments.canceled_at",
    ],
  });
  const orders = (data as unknown as Order[]).filter((o) => o.status !== "canceled" && (o.items ?? []).some((i) => reservedLines.has(i.id)));
  logger.info(`${reservations.length} reservation(s), on ${orders.length} order(s).`);

  for (const order of orders) {
    const payments = (order.payment_collections ?? []).flatMap((pc) => pc.payments ?? []);
    const capturedLightning = payments.some((p) => p.provider_id.includes("coinos") && p.captured_at && !p.canceled_at);
    const fulfilled = (order.fulfillments ?? []).some((f) => !f.canceled_at);
    const force = capturedLightning || fulfilled;
    const how = force
      ? `without refund (${[capturedLightning && "captured Lightning payment", fulfilled && "has a fulfilment"].filter(Boolean).join(", ")})`
      : "with Medusa's cancel";
    if (!apply) {
      logger.info(`Would cancel order #${order.display_id} ${how}.`);
      continue;
    }
    try {
      if (force) {
        await forceCancelOrderWorkflow(container).run({ input: { orderId: order.id, lineItemIds: (order.items ?? []).map((i) => i.id) } });
      } else {
        await cancelOrderWorkflow(container).run({ input: { order_id: order.id } });
      }
      logger.info(`Order #${order.display_id} cancelled ${how}.`);
    } catch (e) {
      logger.warn(`Order #${order.display_id} NOT cancelled: ${(e as Error).message}`);
    }
  }

  // 3. Any reservation not tied to an order (none expected).
  const left = await inventory.listReservationItems({}, { take: 10000 });
  const orphans = left.filter((r) => !orders.some((o) => (o.items ?? []).some((i) => i.id === r.line_item_id)));
  if (orphans.length) {
    logger.info(`${orphans.length} reservation(s) not tied to an open order${apply ? ", deleting" : ""}.`);
    if (apply) await deleteReservationsWorkflow(container).run({ input: { ids: orphans.map((r) => r.id) } });
  }

  if (apply) {
    const after = await inventory.listInventoryLevels({}, { take: 10000 });
    const remaining = await inventory.listReservationItems({}, { take: 10000 });
    const stocked = after.reduce((s, l) => s + Number(l.stocked_quantity), 0);
    const reserved = after.reduce((s, l) => s + Number(l.reserved_quantity), 0);
    logger.info(`After: stocked total ${stocked}, reserved total ${reserved}, reservations ${remaining.length}.`);
  }
}
