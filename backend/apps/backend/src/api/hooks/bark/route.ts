import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"
import { BARK_ARK_PROVIDER_ID } from "../../../modules/bark-ark/types"

// Bark Pay's webhook target, the same as /hooks/coinos (see there for why we
// don't use Medusa's /hooks/payment/:provider and its 5 s delay). The
// signature is checked in the provider's getWebhookActionAndData, against the
// raw body kept by the bodyParser setting in middlewares.ts.
const WEBHOOK_DELAY_MS = 100
const WEBHOOK_ATTEMPTS = 3

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit(
      {
        name: PaymentWebhookEvents.WebhookReceived,
        data: {
          provider: BARK_ARK_PROVIDER_ID,
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
