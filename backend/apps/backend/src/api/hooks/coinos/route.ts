import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"
import { COINOS_LIGHTNING_PROVIDER_ID } from "../../../modules/coinos-lightning/types"

// Coinos's webhook target. The same as Medusa's own
// /hooks/payment/:provider route, except for the processing delay.
//
// Medusa's route holds every webhook for `webhook_delay` ms (default 5000)
// before processing, and reads that option from the payment module, which
// never exposes it (checked at runtime in 2.21.2: always undefined), so the
// default can't be changed by config. That 5 s was most of the wait between
// a member paying and the kiosk showing "paid". The delay guards against a
// race with cart completion, but processPaymentWorkflow and
// completeCartWorkflow both lock the cart in this version, so 100 ms is enough.
//
// Invoices issued before this route existed still point at Medusa's route,
// which keeps working.
const WEBHOOK_DELAY_MS = 100
const WEBHOOK_ATTEMPTS = 3

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit(
      {
        name: PaymentWebhookEvents.WebhookReceived,
        data: {
          provider: COINOS_LIGHTNING_PROVIDER_ID,
          payload: { data: req.body, rawData: req.rawBody, headers: req.headers },
        },
      },
      { delay: WEBHOOK_DELAY_MS, attempts: WEBHOOK_ATTEMPTS }
    )
  } catch (err) {
    res.status(400).send(`Webhook Error: ${(err as Error).message}`)
    return
  }
  res.sendStatus(200)
}
