import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { notifySlack } from "../lib/notify-slack"
import { CoinosClient, CoinosPayment } from "../modules/coinos-lightning/lib/coinos-client"
import { COINOS_LIGHTNING_PROVIDER_ID } from "../modules/coinos-lightning/types"

// Compares Coinos's own payment history against Medusa orders for the
// previous UTC day, per CLAUDE.md: "Reconcile against Coinos, not the
// wallet" and "A daily job compares provider records with Medusa orders."
//
// GET /payments' record shape was confirmed against the live API on Oct 4,
// 2026 (see CoinosPayment in coinos-client.ts). Before that the job assumed
// a bare list and crashed on every run, so it had never actually worked.
// Matching uses every identifier both sides carry: memo (= our session id),
// the Lightning payment hash, and iid (= our stored coinos_invoice_id).
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

  // Every identifier a Coinos payment record carries that we also store on
  // the Medusa payment: memo (= our session id), the Lightning payment hash,
  // and iid (= the Coinos invoice id we stored as coinos_invoice_id).
  const identifiersOf = (p: CoinosPayment): unknown[] => [p.memo, p.hash, p.payment_hash, p.iid]

  const matches = (payment: CoinosPayment): boolean =>
    identifiersOf(payment).some((value) => typeof value === "string" && knownIdentifiers.has(value))

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
    const ours = [data.session_id, data.payment_hash, data.coinos_invoice_id].filter(
      (v): v is string => typeof v === "string" && !!v
    )
    return !confirmedCoinosPayments.some((p) => identifiersOf(p).some((v) => typeof v === "string" && ours.includes(v)))
  })

  if (capturedWithoutRecentCoinosRecord.length > 0) {
    logger.warn(
      `reconcile-coinos-payments: ${capturedWithoutRecentCoinosRecord.length} captured Medusa ` +
        `payment(s) have no matching confirmed record in Coinos's history for the same window: ` +
        JSON.stringify(capturedWithoutRecentCoinosRecord.map((p) => p.id))
    )
  }

  if (unmatched.length || capturedWithoutRecentCoinosRecord.length) {
    const day = start.toISOString().slice(0, 10)
    await notifySlack(container, {
      template: "reconciliation-mismatch",
      data: {
        date: day,
        unmatched_coinos: unmatched.map((p) => ({
          hash: p.hash ?? null,
          memo: p.memo ?? null,
          amount: typeof p.amount === "number" ? p.amount : null,
        })),
        captured_without_coinos: capturedWithoutRecentCoinosRecord.map((p) => p.id),
      },
      // One message per reconciled day, even if the job is re-run.
      idempotencyKey: `slack:reconciliation:${day}`,
      triggerType: "job:reconcile-coinos-payments",
    })
  }
}

export const config = {
  name: "reconcile-coinos-payments",
  schedule: "0 6 * * *",
}
