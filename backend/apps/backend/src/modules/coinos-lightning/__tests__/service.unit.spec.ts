import { PaymentActions } from "@medusajs/framework/utils"
import CoinosLightningProviderService from "../service"

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

const options = {
  coinosApiUrl: "https://coinos.test/api",
  coinosApiToken: "test-token",
  yadioApiUrl: "https://yadio.test",
  webhookSecret: "shared-secret",
  webhookBaseUrl: "https://backend.test",
}

describe("CoinosLightningProviderService", () => {
  let fetchMock: jest.Mock
  let logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock }

  const makeService = () =>
    // The base class constructor only reads from the container/options it's
    // given; a plain object stands in fine for the real module container.
    new CoinosLightningProviderService({ logger } as any, options as any)

  beforeEach(() => {
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  })

  describe("initiatePayment", () => {
    it("converts the Bs amount to sats via Yadio and creates a Coinos invoice carrying the session id", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ rate: 0.000001 })) // GET /rate/BTC/BOB
        .mockResolvedValueOnce(
          jsonResponse({
            id: "inv_1",
            text: "lnbc1...",
            hash: "lnbc1...",
            paymentHash: "hash123",
            amount: 1000,
            received: 0,
          })
        )

      const service = makeService()
      const result = await service.initiatePayment({
        amount: 10,
        currency_code: "bob",
        data: { session_id: "payses_123" },
      } as any)

      const invoiceCall = fetchMock.mock.calls[1]
      expect(invoiceCall[0]).toBe("https://coinos.test/api/invoice")
      const sentBody = JSON.parse(invoiceCall[1].body)
      expect(sentBody.invoice).toMatchObject({
        amount: 1000,
        memo: "payses_123",
        webhook: "https://backend.test/hooks/payment/pp_coinos-lightning_coinos-lightning",
        secret: "shared-secret",
      })

      expect(result.id).toBe("inv_1")
      expect(result.data).toMatchObject({
        session_id: "payses_123",
        coinos_invoice_id: "inv_1",
        bolt11: "lnbc1...",
        sats_amount: 1000,
        bob_amount: 10,
        yadio_rate_btc_per_bob: 0.000001,
      })
      // Computed from the default expiry, not read off the Coinos response.
      expect(result.data!.expires_at as number).toBeGreaterThan(Date.now())
      expect(result.data!.expires_at as number).toBeLessThanOrEqual(Date.now() + 600_000)
    })

    it("propagates the Yadio error instead of creating an invoice when the rate is unavailable", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"))
      const service = makeService()

      await expect(
        service.initiatePayment({ amount: 10, currency_code: "bob", data: { session_id: "payses_123" } } as any)
      ).rejects.toThrow("network down")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("authorizePayment", () => {
    it("returns captured when Coinos reports the invoice fully paid", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", received: 1000, amount: 1000 }))
      const service = makeService()

      const result = await service.authorizePayment({
        data: { coinos_invoice_id: "inv_1", sats_amount: 1000 },
      } as any)

      expect(result.status).toBe("captured")
    })

    it("returns pending_authorization when the invoice is still unpaid", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", received: 0, amount: 1000 }))
      const service = makeService()

      const result = await service.authorizePayment({
        data: { coinos_invoice_id: "inv_1", sats_amount: 1000 },
      } as any)

      expect(result.status).toBe("pending_authorization")
    })
  })

  describe("getWebhookActionAndData", () => {
    it("reports a captured action for a confirmed payment with a valid secret", async () => {
      const service = makeService()

      const result = await service.getWebhookActionAndData({
        data: {
          memo: "payses_123",
          confirmed: true,
          amount: 1000,
          secret: "shared-secret",
        },
        rawData: "",
        headers: {},
      } as any)

      expect(result.action).toBe(PaymentActions.SUCCESSFUL)
      expect(result.data?.session_id).toBe("payses_123")
      expect(Number(result.data?.amount)).toBe(1000)
    })

    it("ignores a callback with the wrong secret", async () => {
      const service = makeService()

      const result = await service.getWebhookActionAndData({
        data: { memo: "payses_123", confirmed: true, amount: 1000, secret: "wrong" },
        rawData: "",
        headers: {},
      } as any)

      expect(result.action).toBe(PaymentActions.NOT_SUPPORTED)
      expect(logger.warn).toHaveBeenCalled()
    })

    it("ignores an unconfirmed payment event", async () => {
      const service = makeService()

      const result = await service.getWebhookActionAndData({
        data: { memo: "payses_123", confirmed: false, amount: 1000, secret: "shared-secret" },
        rawData: "",
        headers: {},
      } as any)

      expect(result.action).toBe(PaymentActions.NOT_SUPPORTED)
    })

    it("ignores a callback with no memo to tie it back to a session", async () => {
      const service = makeService()

      const result = await service.getWebhookActionAndData({
        data: { confirmed: true, amount: 1000, secret: "shared-secret" },
        rawData: "",
        headers: {},
      } as any)

      expect(result.action).toBe(PaymentActions.NOT_SUPPORTED)
    })
  })

  describe("refundPayment", () => {
    it("throws since Coinos has no refund API", async () => {
      const service = makeService()
      await expect(service.refundPayment({ data: {}, amount: 10 } as any)).rejects.toThrow(
        "refunds are not supported"
      )
    })
  })
})
