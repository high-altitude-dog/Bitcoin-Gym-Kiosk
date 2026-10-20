import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { planCashCollect, type CartForCashCollect } from "../../../../lib/cash-collect"
import { notifySlack } from "../../../../lib/notify-slack"

// POST /store/cash-collect/:cartId  { attempt, cancelled? }
// The kiosk's cash screen opened (or "Cancelar" was tapped on it): tell the
// staff channel how much cash to collect (or not to). Rules in lib/cash-collect.ts.
export async function POST(req: MedusaStoreRequest<{ attempt?: unknown; cancelled?: unknown }>, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "sales_channel_id", "completed_at", "items.*"],
    filters: { id: req.params.id },
  })
  const plan = planCashCollect(
    data[0] as unknown as CartForCashCollect | undefined,
    req.publishable_key_context?.sales_channel_ids ?? [],
    (req.body ?? {}) as { attempt?: unknown; cancelled?: unknown }
  )
  if (plan.action === "refuse") {
    res.status(404).json({ message: "Not found" })
    return
  }
  await notifySlack(req.scope, {
    destination: "staff",
    template: plan.template,
    data: plan.data,
    idempotencyKey: plan.idempotencyKey,
    triggerType: "route:cash-collect",
    resourceId: req.params.id,
    resourceType: "cart",
  })
  res.json({ notified: true })
}
