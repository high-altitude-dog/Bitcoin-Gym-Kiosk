import { MedusaError } from "@medusajs/framework/utils"

// Yadio's /rate/{to}/{from} returns how many units of {to} equal 1 unit of
// {from} — confirmed by calling the live API (api.yadio.io) with several
// pairs, since docs.yadio.io is a JS-rendered page that couldn't be read
// directly. So /rate/BTC/BOB gives BTC per 1 BOB, which is what we need.
const SATS_PER_BTC = 100_000_000
const DEFAULT_CACHE_TTL_MS = 60_000

export type YadioRate = {
  btcPerBob: number
  fetchedAt: number
}

export type YadioClientOptions = {
  baseUrl: string
  cacheTtlMs?: number
  fetchImpl?: typeof fetch
}

export class YadioClient {
  private readonly baseUrl: string
  private readonly cacheTtlMs: number
  private readonly fetchImpl: typeof fetch
  private cached: YadioRate | null = null

  constructor(options: YadioClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private isFresh(rate: YadioRate | null): rate is YadioRate {
    return !!rate && Date.now() - rate.fetchedAt < this.cacheTtlMs
  }

  // Throws if the cache is stale and Yadio can't be reached — callers that
  // need a rate to create an invoice should let this propagate.
  async getRate(): Promise<YadioRate> {
    if (this.isFresh(this.cached)) {
      return this.cached
    }

    const res = await this.fetchImpl(`${this.baseUrl}/rate/BTC/BOB`)
    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Yadio rate request failed with status ${res.status}`
      )
    }

    const body = (await res.json()) as { rate?: unknown }
    if (typeof body.rate !== "number" || !Number.isFinite(body.rate) || body.rate <= 0) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Yadio returned an invalid rate")
    }

    this.cached = { btcPerBob: body.rate, fetchedAt: Date.now() }
    return this.cached
  }

  // Never throws: used to decide whether to show Lightning as an option at
  // all, per the "hide Lightning, keep bank QR working" rule.
  async isAvailable(): Promise<boolean> {
    try {
      await this.getRate()
      return true
    } catch {
      return false
    }
  }

  satsForBob(amountBob: number, rate: YadioRate): number {
    return Math.round(amountBob * rate.btcPerBob * SATS_PER_BTC)
  }
}

const shared = new Map<string, YadioClient>()

// One client (and so one rate cache) per Yadio URL for the whole process,
// so the store route that decides whether to show Lightning and the
// provider that prices the invoice agree on whether a fresh rate exists.
export function sharedYadioClient(baseUrl: string, cacheTtlMs?: number): YadioClient {
  let client = shared.get(baseUrl)
  if (!client) {
    client = new YadioClient({ baseUrl, cacheTtlMs })
    shared.set(baseUrl, client)
  }
  return client
}
