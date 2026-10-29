import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sharedYadioClient } from "../../../modules/coinos-lightning/lib/yadio-client"

// Lets the kiosk decide whether to show the Lightning button before the
// member picks a payment method, per CLAUDE.md: "If the cached rate is too
// old and Yadio is unreachable, hide the Lightning option; bank QR keeps
// working." Uses the same shared client (and rate cache) as the payment
// provider, so "available" here means the provider can price an invoice.
//
// `ark` says whether to offer "Bitcoin Ark" (src/modules/bark-ark): it needs
// the same fresh rate, and Bark Pay configured on this backend. The kiosk's
// "BIP321 Ark/Bolt12" button (src/modules/bip321-ark-bolt12) needs the same, so
// it uses `ark` too.
//
// YADIO_API_URL is read per request, not when this file is imported: an
// unset variable then just reports Lightning unavailable instead of
// crashing the whole backend at startup.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const baseUrl = process.env.YADIO_API_URL
  if (!baseUrl) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn("lightning-availability: YADIO_API_URL is not set, reporting Lightning unavailable")
    res.json({ available: false, ark: false })
    return
  }
  const available = await sharedYadioClient(baseUrl).isAvailable()
  res.json({ available, ark: available && !!process.env.BARKPAY_API_KEY })
}
