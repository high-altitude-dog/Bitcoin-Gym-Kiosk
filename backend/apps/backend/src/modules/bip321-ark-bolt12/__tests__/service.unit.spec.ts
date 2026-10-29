import Bip321ProviderService, { bip321Uri } from "../service"

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

const ARK = "ark1qexampleaddress"
const OFFER = "lno1qexampleoffer"

const charge = (over: Record<string, unknown> = {}) => ({
  id: "ch_1",
  livemode: true,
  status: "pending",
  amountSat: 1000,
  amountReceivedSat: 0,
  reference: "payses_123",
  rails: [{ rail: "ark", value: ARK, status: "active" }],
  expiresAt: 0,
  paidAt: null,
  ...over,
})

const offer = (over: Record<string, unknown> = {}) => ({
  id: "inv_1",
  hash: "h",
  text: OFFER,
  amount: 1000,
  received: 0,
  ...over,
})

describe("bip321Uri", () => {
  it("puts the amount, the Ark address and the BOLT12 offer in one URI with no on-chain address", () => {
    expect(bip321Uri(103, ARK, OFFER)).toBe(`bitcoin:?amount=0.00000103&ark=${ARK}&lno=${OFFER}`)
  })
})

describe("Bip321ProviderService", () => {
  let fetchMock: jest.Mock
  let logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock }
  let serviceCount = 0
  const makeService = () =>
    new Bip321ProviderService({ logger } as any, {
      coinosApiUrl: "https://coinos.test/api",
      coinosApiToken: "tok",
      coinosWebhookSecret: "secret",
      webhookBaseUrl: "https://api.test/",
      barkPayUrl: "https://bark.test",
      barkPayApiKey: "sk_live_test",
      // A distinct Yadio URL per service: the rate cache is shared per URL.
      yadioApiUrl: `https://yadio.test/bip321/${++serviceCount}`,
    } as any)

  // Answers by URL, so the parallel Coinos and Bark Pay calls can come in either order.
  const route = (routes: Record<string, () => unknown>) =>
    fetchMock.mockImplementation(async (url: string) => {
      for (const [part, answer] of Object.entries(routes)) {
        if (url.includes(part)) return answer()
      }
      throw new Error(`unexpected fetch ${url}`)
    })

  beforeEach(() => {
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  })

  it("creates a single-use BOLT12 offer and an Ark-only charge for the same sats, and one URI", async () => {
    route({
      "yadio.test": () => jsonResponse({ rate: 0.000001 }), // 10 Bs = 1000 sats
      "coinos.test": () => jsonResponse(offer()),
      "bark.test": () => jsonResponse(charge()),
    })

    const result = await makeService().initiatePayment({
      amount: 10,
      currency_code: "bob",
      data: { session_id: "payses_123" },
    } as any)

    const call = (part: string) => fetchMock.mock.calls.find(([url]) => url.includes(part))!
    expect(JSON.parse(call("coinos.test")[1].body).invoice).toMatchObject({
      amount: 1000,
      memo: "payses_123",
      type: "bolt12",
      single_use: true,
      expiry: 600,
      webhook: "https://api.test/hooks/coinos",
      secret: "secret",
    })
    const [barkUrl, barkInit] = call("bark.test")
    expect(barkUrl).toBe("https://bark.test/v1/charges")
    expect(barkInit.headers["Idempotency-Key"]).toBe("kiosk-bip321-payses_123")
    expect(JSON.parse(barkInit.body)).toMatchObject({ amountSat: 1000, reference: "payses_123", rails: ["ark"] })
    expect(result.data).toMatchObject({
      coinos_invoice_id: "inv_1",
      bark_charge_id: "ch_1",
      payment_uri: `bitcoin:?amount=0.00001&ark=${ARK}&lno=${OFFER}`,
      sats_amount: 1000,
      bob_amount: 10,
      expiry_seconds: 600,
    })
  })

  const session = { data: { session_id: "payses_123", coinos_invoice_id: "inv_1", bark_charge_id: "ch_1", sats_amount: 1000 } }

  it("captures when the Ark charge is paid", async () => {
    route({
      "coinos.test": () => jsonResponse(offer()),
      "bark.test": () => jsonResponse(charge({ status: "paid", amountReceivedSat: 1000 })),
    })
    const result = await makeService().authorizePayment(session as any)
    expect(result.status).toBe("captured")
    expect(result.data).toMatchObject({ paid_rail: "ark", received_sats: 1000 })
  })

  it("captures when the BOLT12 offer is paid", async () => {
    route({
      "coinos.test": () => jsonResponse(offer({ received: 1000 })),
      "bark.test": () => jsonResponse(charge()),
    })
    const result = await makeService().authorizePayment(session as any)
    expect(result.status).toBe("captured")
    expect(result.data).toMatchObject({ paid_rail: "bolt12", received_sats: 1000 })
  })

  it("captures on one side even when the other lookup fails", async () => {
    route({
      "coinos.test": () => jsonResponse(offer({ received: 1000 })),
      "bark.test": () => jsonResponse({}, false, 502),
    })
    expect((await makeService().authorizePayment(session as any)).status).toBe("captured")
  })

  it("keeps waiting when neither is paid", async () => {
    route({
      "coinos.test": () => jsonResponse(offer({ received: 10 })),
      "bark.test": () => jsonResponse(charge({ status: "underpaid", amountReceivedSat: 5 })),
    })
    expect((await makeService().authorizePayment(session as any)).status).toBe("pending_authorization")
  })

  it("throws, rather than reading unpaid, when a lookup fails and nothing is paid", async () => {
    route({
      "coinos.test": () => jsonResponse(null, false, 404),
      "bark.test": () => jsonResponse(charge()),
    })
    await expect(makeService().authorizePayment(session as any)).rejects.toThrow()
  })

  it("warns when both sides were paid", async () => {
    route({
      "coinos.test": () => jsonResponse(offer({ received: 1000 })),
      "bark.test": () => jsonResponse(charge({ status: "paid", amountReceivedSat: 1000 })),
    })
    const result = await makeService().authorizePayment(session as any)
    expect(result.data).toMatchObject({ paid_rail: "ark", received_sats: 2000 })
    expect(logger.warn).toHaveBeenCalled()
  })
})
