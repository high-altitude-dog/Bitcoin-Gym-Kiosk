import { MedusaError } from "@medusajs/framework/utils"

// Confirmed against the live API (coinos.io/api) and against the open-source
// coinos-server code (github.com/coinos/coinos-server), which is what
// coinos.io runs, since coinos.io/docs is a JS-rendered page that couldn't
// be read directly:
//   - base URL: https://coinos.io/api
//   - POST /invoice, body { invoice: { amount (sats), memo, expiry, webhook, secret } }
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

// Unconfirmed: the full field list of a payment record from GET /payments —
// seen the route's filtering logic (start/end/limit/offset/received) but not
// a live authenticated response. Treated as a loose bag of known-likely
// fields for reconciliation; code should not assume more than this.
export type CoinosPayment = {
  hash?: string
  amount?: number
  confirmed?: boolean
  received?: number
  memo?: string
  created?: number
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

  async listPayments(params: { start?: number; end?: number } = {}): Promise<CoinosPayment[]> {
    const query = new URLSearchParams()
    if (params.start) query.set("start", String(params.start))
    if (params.end) query.set("end", String(params.end))

    const res = await this.fetchImpl(`${this.baseUrl}/payments?${query.toString()}`, {
      headers: this.authHeaders(),
    })

    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Coinos payments list failed with status ${res.status}`
      )
    }

    return (await res.json()) as CoinosPayment[]
  }
}
