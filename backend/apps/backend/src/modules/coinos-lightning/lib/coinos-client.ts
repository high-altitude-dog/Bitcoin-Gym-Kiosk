import { MedusaError } from "@medusajs/framework/utils"

// Confirmed against the live API (coinos.io/api) and against the open-source
// coinos-server code (git.coinos.io/coinos-server.git; the GitHub copy is gone), which is what
// coinos.io runs, since coinos.io/docs is a JS-rendered page that couldn't
// be read directly:
//   - base URL: https://coinos.io/api
//   - POST /invoice, body { invoice: { amount (sats), memo, expiry, webhook, secret, type } }
//     (type: "lightning" gives a BOLT11 invoice and is the default; "bolt12" an
//     offer; anything else is a 500 "unrecognized type". Tested live Oct 8, 2026.)
//     single_use: true caps a BOLT12 offer at one payment; an offer without it
//     can be paid any number of times. Since coinos-server 0cbfab47 (Oct 8, 2026)
//     both it and the expiry are set on the offer itself (absolute_expiry).
//   - GET /invoice/:id — public, returns the invoice with its current `received`
//   - GET /payments — requires Authorization: Bearer <token>, supports start/end/limit/offset
export type CoinosInvoice = {
  id: string
  hash: string
  text: string
  paymentHash?: string
  amount: number
  received: number
  expiry?: number
  created?: number
}

// A payment record from GET /payments. Confirmed against a live
// authenticated response on Oct 4, 2026: the endpoint returns
// { payments: CoinosPayment[], count, incoming, outgoing }, not a bare list.
// `iid` is the Coinos invoice id the payment paid; `amount` is in sats and
// negative for outgoing payments.
export type CoinosPayment = {
  id?: string
  iid?: string
  hash?: string
  payment_hash?: string
  amount?: number
  confirmed?: boolean
  memo?: string
  created?: number
  type?: string
  [key: string]: unknown
}

export type CoinosClientOptions = {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}

export type CreateInvoiceInput = {
  amountSats: number
  memo: string
  expirySeconds: number
  webhookUrl: string
  webhookSecret: string
  type: "lightning" | "bolt12"
  singleUse?: boolean
}

export class CoinosClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch

  constructor(options: CoinosClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    }
  }

  async createInvoice(input: CreateInvoiceInput): Promise<CoinosInvoice> {
    const res = await this.fetchImpl(`${this.baseUrl}/invoice`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        invoice: {
          amount: input.amountSats,
          memo: input.memo,
          expiry: input.expirySeconds,
          webhook: input.webhookUrl,
          secret: input.webhookSecret,
          type: input.type,
          ...(input.singleUse ? { single_use: true } : {}),
        },
      }),
    })

    const body = await res.json().catch(() => null)
    if (!res.ok || !body) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Coinos invoice creation failed: ${res.status} ${JSON.stringify(body)}`
      )
    }

    return body as CoinosInvoice
  }

  // Returns null for "not found" rather than throwing, since the route
  // returns a plain-text "invoice not found" body instead of JSON.
  async getInvoice(id: string): Promise<CoinosInvoice | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/invoice/${id}`)
    const body = await res.json().catch(() => null)
    if (!res.ok || !body || typeof body !== "object") {
      return null
    }
    return body as CoinosInvoice
  }

  // Incoming payments only (`received`): outgoing ones, like moving funds
  // out of Coinos, can never match a kiosk order. With a start/end window
  // and no `limit`, coinos-server returns every payment in the window.
  async listPayments(params: { start?: number; end?: number } = {}): Promise<CoinosPayment[]> {
    const query = new URLSearchParams()
    if (params.start) query.set("start", String(params.start))
    if (params.end) query.set("end", String(params.end))
    query.set("received", "1")

    const res = await this.fetchImpl(`${this.baseUrl}/payments?${query.toString()}`, {
      headers: this.authHeaders(),
    })

    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Coinos payments list failed with status ${res.status}`
      )
    }

    const body = (await res.json()) as { payments?: CoinosPayment[] }
    if (!Array.isArray(body?.payments)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Coinos payments list returned an unexpected shape (no `payments` array)"
      )
    }
    return body.payments.filter((p) => (p.amount ?? 0) > 0)
  }
}
