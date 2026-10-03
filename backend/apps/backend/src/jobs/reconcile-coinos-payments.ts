import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CoinosClient, CoinosPayment } from "../modules/coinos-lightning/lib/coinos-client"
import { COINOS_LIGHTNING_PROVIDER_ID } from "../modules/coinos-lightning/types"

// Compares Coinos's own payment history against Medusa orders for the
// previous UTC day, per CLAUDE.md: "Reconcile against Coinos, not the
// wallet" and "A daily job compares provider records with Medusa orders."
//
// Unconfirmed: the exact field list GET /payments returns per record (only
// the route's start/end/limit/offset/received filtering was readable from
// the coinos-server source, not a live authenticated response). Matching
// below tries every identifier we stored on the Medusa payment — memo
// (= our session id), the Lightning payment hash, and the invoice id — so it
// keeps working even if only some of those fields come back on each record.
export default async function reconcileCoinosPayments(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const coinosApiUrl = process.env.COINOS_API_URL
  const coinosApiToken = process.env.COINOS_API_TOKEN
  if (!coinosApiUrl || !coinosApiToken) {
    logger.warn("reconcile-coinos-payments: COINOS_API_URL/COINOS_API_TOKEN not set, skipping")
    return
  }

  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 1)

  const coinos = new CoinosClient({ baseUrl: coinosApiUrl, token: coinosApiToken })
  const coinosPayments = await coinos.listPayments({
    start: start.getTime(),
    end: end.getTime(),
  })
  const confirmedCoinosPayments = coinosPayments.filter((p) => p.confirmed)

  const { data: medusaPayments } = await query.graph({
    entity: "payment",
    fields: ["id", "data", "captured_at", "created_at"],
    filters: {
      provider_id: COINOS_LIGHTNING_PROVIDER_ID,
      created_at: { $gte: start.toISOString(), $lt: end.toISOString() },
    },
  })

  const knownIdentifiers = new Set<string>()
  for (const payment of medusaPayments) {
    const data = (payment.data ?? {}) as Record<string, unknown>
    for (const value of [data.session_id, data.payment_hash, data.coinos_invoice_id]) {
      if (typeof value === "string" && value) knownIdentifiers.add(value)
    }
  }

  const matches = (payment: CoinosPayment): boolean => {
    for (const value of [payment.memo, payment.hash, (payment as Record<string, unknown>).paymentHash]) {
      if (typeof value === "string" && knownIdentifiers.has(value)) return true
    }
    return false
  }

  const unmatched = confirmedCoinosPayments.filter((p) => !matches(p))

  if (unmatched.length > 0) {
    logger.warn(
      `reconcile-coinos-payments: ${unmatched.length} confirmed Coinos payment(s) for ` +
        `${start.toISOString()}..${end.toISOString()} have no matching Medusa payment: ` +
        JSON.stringify(unmatched.map((p) => ({ hash: p.hash, memo: p.memo, amount: p.amount })))
    )
  } else {
    logger.info(
      `reconcile-coinos-payments: ${confirmedCoinosPayments.length} confirmed Coinos payment(s) ` +
        `for ${start.toISOString()}..${end.toISOString()} all matched a Medusa payment.`
    )
  }

  const capturedWithoutRecentCoinosRecord = medusaPayments.filter((payment) => {
    if (!payment.captured_at) return false
    const data = (payment.data ?? {}) as Record<string, unknown>
    return !confirmedCoinosPayments.some(
      (p) =>
        (typeof data.session_id === "string" && p.memo === data.session_id) ||
        (typeof data.payment_hash === "string" &&
          (p.hash === data.payment_hash || (p as Record<string, unknown>).paymentHash === data.payment_hash))
    )
  })

  if (capturedWithoutRecentCoinosRecord.length > 0) {
    logger.warn(
      `reconcile-coinos-payments: ${capturedWithoutRecentCoinosRecord.length} captured Medusa ` +
        `payment(s) have no matching confirmed record in Coinos's history for the same window: ` +
        JSON.stringify(capturedWithoutRecentCoinosRecord.map((p) => p.id))
    )
  }
}

export const config = {
  name: "reconcile-coinos-payments",
  schedule: "0 6 * * *",
}
