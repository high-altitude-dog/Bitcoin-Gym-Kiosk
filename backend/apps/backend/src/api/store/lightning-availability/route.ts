import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { YadioClient } from "../../../modules/coinos-lightning/lib/yadio-client"

// Lets the kiosk decide whether to show the Lightning button before the
// member picks a payment method, per CLAUDE.md: "If the cached rate is too
// old and Yadio is unreachable, hide the Lightning option; bank QR keeps
// working." A fresh YadioClient is used here (this route runs outside the
// payment provider's own container), so this is its own independent check
// against Yadio rather than a read of the provider's internal cache.
const yadio = new YadioClient({ baseUrl: process.env.YADIO_API_URL! })

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const available = await yadio.isAvailable()
  res.json({ available })
}
