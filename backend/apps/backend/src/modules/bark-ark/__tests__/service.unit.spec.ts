import { createHmac } from "crypto"
import { PaymentActions } from "@medusajs/framework/utils"
import BarkArkProviderService from "../service"
import { paymentUri } from "../lib/bark-pay-client"
import { verifyBarkSignature } from "../lib/webhook-signature"

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

const SECRET = "whsec_test"
const options = {
  barkPayUrl: "https://bark.test/",
  barkPayApiKey: "sk_live_test",
  webhookSecret: SECRET,
  yadioApiUrl: "https://yadio.test",
}

const ARK = "ark1qexampleaddress"
const LN = "lnbc10n1pexampleinvoice"

const charge = (over: Record<string, unknown> = {}) => ({
  object: "charge",
  id: "ch_1",
  livemode: true,
  status: "pending",
  amountSat: 1000,
  amountReceivedSat: 0,
  reference: "payses_123",
  rails: [
    { rail: "lightning", value: LN, ref: null, status: "active" },
    { rail: "ark", value: ARK, ref: null, status: "active" },
  ],
  expiresAt: 0,
  paidAt: null,
  ...over,
})

const sign = (body: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`

describe("paymentUri", () => {
  it("puts both rails in one BIP 321 URI, Ark first", () => {
    expect(paymentUri(charge().rails as any)).toBe(`bitcoin:?ark=${ARK}&lightning=${LN}`)
  })

  it("works with a single rail", () => {
    expect(paymentUri([{ rail: "lightning", value: LN, status: "active" }])).toBe(`bitcoin:?lightning=${LN}`)
  })

  it("refuses a charge with neither rail", () => {
    expect(() => paymentUri([{ rail: "onchain", value: "bc1q", status: "active" }])).toThrow()
  })
})

describe("verifyBarkSignature", () => {
  const body = '{"id":"evt_1"}'

  it("accepts a correct signature", () => {
    expect(verifyBarkSignature(sign(body), body, SECRET)).toBe(true)
  })

  it("rejects a changed body, a wrong secret, a missing header and an old timestamp", () => {
    expect(verifyBarkSignature(sign(body), body + " ", SECRET)).toBe(false)
    expect(verifyBarkSignature(sign(body), body, "whsec_other")).toBe(false)
    expect(verifyBarkSignature(undefined, body, SECRET)).toBe(false)
    expect(verifyBarkSignature(sign(body, Math.floor(Date.now() / 1000) - 600), body, SECRET)).toBe(false)
  })

  it("accepts any matching v1 when several are sent (secret rotation)", () => {
    const t = Math.floor(Date.now() / 1000)
    const good = sign(body, t).split(",")[1]
    expect(verifyBarkSignature(`t=${t},v1=${"0".repeat(64)},${good}`, body, SECRET)).toBe(true)
  })
})

describe("BarkArkProviderService", () => {
  let fetchMock: jest.Mock
  let logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock }
  let serviceCount = 0
  // A distinct Yadio URL per service: the rate cache is shared per URL.
  const makeService = () =>
    new BarkArkProviderService(
      { logger } as any,
      { ...options, yadioApiUrl: `https://yadio.test/${++serviceCount}` } as any
    )

  beforeEach(() => {
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  })

  it("creates an Ark + Lightning charge in sats, once per session, and returns one QR URI", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ rate: 0.000001 })) // Yadio: 10 Bs = 1000 sats
      .mockResolvedValueOnce(jsonResponse(charge()))

    const result = await makeService().initiatePayment({
      amount: 10,
      currency_code: "bob",
      data: { session_id: "payses_123" },
    } as any)

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe("https://bark.test/v1/charges")
    expect(init.headers.Authorization).toBe("Bearer sk_live_test")
    expect(init.headers["Idempotency-Key"]).toBe("kiosk-payses_123")
    expect(JSON.parse(init.body)).toMatchObject({
      amountSat: 1000,
      reference: "payses_123",
      rails: ["ark", "lightning"],
      expiresIn: 600,
    })
    expect(result.id).toBe("ch_1")
    expect(result.data).toMatchObject({
      bark_charge_id: "ch_1",
      payment_uri: `bitcoin:?ark=${ARK}&lightning=${LN}`,
      sats_amount: 1000,
      bob_amount: 10,
      expiry_seconds: 600,
    })
  })

  it("asks for at least 1 sat, so a tiny total never reaches Bark Pay as 0", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ rate: 1e-12 }))
      .mockResolvedValueOnce(jsonResponse(charge({ amountSat: 1 })))
    await makeService().initiatePayment({ amount: 1, currency_code: "bob", data: { session_id: "s" } } as any)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).amountSat).toBe(1)
  })

  it.each(["paid", "paid_late", "overpaid"])("authorizes as captured when Bark Pay says %s", async (status) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(charge({ status, amountReceivedSat: 1000, rails: [{ rail: "ark", value: ARK, status: "won" }] }))
    )
    const result = await makeService().authorizePayment({ data: { bark_charge_id: "ch_1" } } as any)
    expect(result.status).toBe("captured")
    expect(result.data).toMatchObject({ received_sats: 1000, paid_rail: "ark" })
  })

  it.each(["pending", "underpaid", "expired", "cancelled"])("keeps waiting when Bark Pay says %s", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(charge({ status })))
    const result = await makeService().authorizePayment({ data: { bark_charge_id: "ch_1" } } as any)
    expect(result.status).toBe("pending_authorization")
  })

  it("throws, rather than reading unpaid, when the lookup fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: {} }, false, 502))
    await expect(makeService().authorizePayment({ data: { bark_charge_id: "ch_1" } } as any)).rejects.toThrow()
  })

  describe("getWebhookActionAndData", () => {
    const event = (type: string, status: string) =>
      JSON.stringify({ id: "evt_1", type, data: { object: charge({ status }) } })
    const payload = (raw: string, signature = sign(raw)) => ({
      data: JSON.parse(raw),
      rawData: Buffer.from(raw),
      headers: { "bark-signature": signature },
    })

    it("maps a signed charge.paid to the session", async () => {
      const raw = event("charge.paid", "paid")
      const result = await makeService().getWebhookActionAndData(payload(raw) as any)
      expect(result).toEqual({ action: PaymentActions.SUCCESSFUL, data: { session_id: "payses_123" } })
    })

    it("accepts charge.overpaid", async () => {
      const raw = event("charge.overpaid", "overpaid")
      const result = await makeService().getWebhookActionAndData(payload(raw) as any)
      expect(result.action).toBe(PaymentActions.SUCCESSFUL)
    })

    it("ignores a bad signature", async () => {
      const raw = event("charge.paid", "paid")
      const result = await makeService().getWebhookActionAndData(payload(raw, sign("{}")) as any)
      expect(result.action).toBe(PaymentActions.NOT_SUPPORTED)
      expect(logger.warn).toHaveBeenCalled()
    })

    it("ignores other events, and an overpaid event on a cancelled charge", async () => {
      for (const [type, status] of [
        ["charge.created", "pending"],
        ["charge.underpaid", "underpaid"],
        ["charge.expired", "expired"],
        ["charge.overpaid", "cancelled"],
      ]) {
        const raw = event(type, status)
        const result = await makeService().getWebhookActionAndData(payload(raw) as any)
        expect(result.action).toBe(PaymentActions.NOT_SUPPORTED)
      }
    })
  })
})
