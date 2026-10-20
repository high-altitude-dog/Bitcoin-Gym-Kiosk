import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { decideCashAutoCapture, type OrderForAutoCapture } from "../../../../../lib/cash-auto-capture"
import { notifySlack } from "../../../../../lib/notify-slack"

// POST /store/cash-orders/:id/auto-capture: the kiosk's cash screen ran out
// its 5 minutes with no tap, so the order it just placed is recorded as paid.
// Capturing here (in the server process) emits payment.captured, and
// subscribers/cash-payment-captured.ts fulfils the order as for staff's
// Capture button. Who may do this is decided in lib/cash-auto-capture.ts.
export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "status", "total", "sales_channel_id", "created_at",
      "payment_collections.payments.id", "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at", "payment_collections.payments.canceled_at",
    ],
    filters: { id: req.params.id },
  })
  const order = data[0] as unknown as (OrderForAutoCapture & { display_id: number; total: number }) | undefined
  const decision = decideCashAutoCapture(order, req.publishable_key_context?.sales_channel_ids ?? [], Date.now())

  if (decision.action === "refuse") {
    res.status(404).json({ message: "Not found" })
    return
  }
  if (decision.action === "capture") {
    await capturePaymentWorkflow(req.scope).run({ input: { payment_id: decision.paymentId } })
    logger.info(`cash-auto-capture: order #${order!.display_id} recorded as paid after 5 minutes with no tap on the kiosk`)
    const backendUrl = process.env.MEDUSA_BACKEND_URL
    await notifySlack(req.scope, {
      template: "cash-auto-paid",
      data: {
        display_id: order!.display_id,
        total: Number(order!.total),
        admin_url: backendUrl ? `${backendUrl}/app/orders/${order!.id}` : null,
      },
      idempotencyKey: `slack:cash-auto-paid:${order!.id}`,
      triggerType: "route:cash-auto-capture",
      resourceId: order!.id,
      resourceType: "order",
    })
  }
  res.json({ captured: true })
}
