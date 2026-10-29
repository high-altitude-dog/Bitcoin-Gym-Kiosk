import { MedusaError } from "@medusajs/framework/utils"

// Bark Pay (gitlab.com/ark-bitcoin/labs/bark-pay), self-hosted. Field names are
// from its zod schemas (packages/types/src/index.ts, v0.0.9, commit 0099f91)
// and https://second.tech/docs/bark-pay/integrate.md:
//   - POST /v1/charges, Bearer sk_..., Idempotency-Key replays the first response
//   - GET /v1/charges/:id
//   - a charge carries one rail per payment method: { rail, value, status },
//     value being the Lightning invoice or the Ark address
export type BarkRail = {
  rail: "lightning" | "ark" | "onchain"
  value: string
  status: "active" | "won" | "cancelled"
}

export type BarkChargeStatus =
  | "pending"
  | "paid"
  | "paid_late"
  | "underpaid"
  | "overpaid"
  | "expired"
  | "cancelled"

export type BarkCharge = {
  id: string
  livemode: boolean
  status: BarkChargeStatus
  amountSat: number
  amountReceivedSat: number
  reference: string | null
  rails: BarkRail[]
  expiresAt: number
  paidAt: number | null
}

// What Bark Pay's own docs count as paid (integrate.md's webhook example).
export const PAID_STATUSES: readonly BarkChargeStatus[] = ["paid", "paid_late", "overpaid"]

export type CreateChargeInput = {
  amountSat: number
  reference: string
  description: string
  expiresIn: number
  rails: BarkRail["rail"][]
  idempotencyKey: string
}

export type BarkPayClientOptions = {
  baseUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}

export class BarkPayClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(options: BarkPayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async createCharge(input: CreateChargeInput): Promise<BarkCharge> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        amountSat: input.amountSat,
        reference: input.reference,
        description: input.description,
        expiresIn: input.expiresIn,
        rails: input.rails,
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Bark Pay charge creation failed: ${res.status} ${JSON.stringify(body?.error ?? body)}`
      )
    }
    return body as BarkCharge
  }

  // Throws on any failure: a payment must never read as unpaid because the
  // lookup failed.
  async getCharge(id: string): Promise<BarkCharge> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/charges/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Bark Pay charge lookup failed: ${res.status}`
      )
    }
    return body as BarkCharge
  }
}

// One QR for both rails, as BIP 321: `bitcoin:` with no on-chain address,
// `ark=` (bark's own extension parameter, bark/src/payment_request.rs) and
// `lightning=`. A bark wallet pays the Ark address first; a Lightning-only
// wallet ignores `ark=` (BIP 321: unknown parameters without `req-` are ignored)
// and pays the invoice.
export function paymentUri(rails: BarkRail[]): string {
  const ark = rails.find((r) => r.rail === "ark")?.value
  const lightning = rails.find((r) => r.rail === "lightning")?.value
  if (!ark && !lightning) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Bark Pay charge has no Ark or Lightning rail")
  }
  const params = [
    ark ? `ark=${encodeURIComponent(ark)}` : null,
    lightning ? `lightning=${encodeURIComponent(lightning)}` : null,
  ].filter(Boolean)
  return `bitcoin:?${params.join("&")}`
}
