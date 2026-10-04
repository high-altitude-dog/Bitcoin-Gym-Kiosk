import { CoinosClient } from "../lib/coinos-client"

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

const textResponse = (text: string, ok = false, status = 404) => ({
  ok,
  status,
  json: async () => {
    throw new Error(`Unexpected non-JSON body: ${text}`)
  },
})

describe("CoinosClient", () => {
  let fetchMock: jest.Mock
  let client: CoinosClient

  beforeEach(() => {
    fetchMock = jest.fn()
    client = new CoinosClient({
      baseUrl: "https://coinos.test/api",
      token: "test-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    })
  })

  describe("createInvoice", () => {
    it("posts amount in sats, memo, expiry, webhook and secret", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: "inv_1", text: "lnbc1...", hash: "lnbc1...", paymentHash: "hash123", amount: 1000, received: 0 })
      )

      const invoice = await client.createInvoice({
        amountSats: 1000,
        memo: "payses_123",
        expirySeconds: 600,
        webhookUrl: "https://backend.test/hooks/payment/pp_coinos-lightning_coinos-lightning",
        webhookSecret: "shared-secret",
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://coinos.test/api/invoice",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        })
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.invoice).toEqual({
        amount: 1000,
        memo: "payses_123",
        expiry: 600,
        webhook: "https://backend.test/hooks/payment/pp_coinos-lightning_coinos-lightning",
        secret: "shared-secret",
      })
      expect(invoice.id).toBe("inv_1")
    })

    it("throws with the response status and body on failure", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400))

      await expect(
        client.createInvoice({
          amountSats: 1000,
          memo: "payses_123",
          expirySeconds: 600,
          webhookUrl: "https://backend.test/hooks",
          webhookSecret: "secret",
        })
      ).rejects.toThrow("Coinos invoice creation failed: 400")
    })
  })

  describe("getInvoice", () => {
    it("returns the invoice when found", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", received: 1000, amount: 1000 }))

      const invoice = await client.getInvoice("inv_1")

      expect(fetchMock).toHaveBeenCalledWith("https://coinos.test/api/invoice/inv_1")
      expect(invoice?.received).toBe(1000)
    })

    it("returns null for Coinos's plain-text 'invoice not found' response", async () => {
      fetchMock.mockResolvedValueOnce(textResponse("invoice not found"))

      await expect(client.getInvoice("missing")).resolves.toBeNull()
    })
  })

  describe("listPayments", () => {
    // The real response shape, confirmed against the live API on Oct 4, 2026.
    // An earlier version of this test mocked a bare array, the same wrong
    // assumption the reconciliation job made, so both passed while the job
    // could never have worked against the real API.
    it("unwraps { payments }, asks for incoming only, and drops outgoing amounts", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          payments: [
            { id: "p1", iid: "inv_1", hash: "abc", payment_hash: "ph1", memo: "payses_1", confirmed: true, amount: 1000 },
            { id: "p2", hash: "out", confirmed: true, amount: -500 },
          ],
          count: 2,
          incoming: {},
          outgoing: {},
        })
      )

      const payments = await client.listPayments({ start: 1000, end: 2000 })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://coinos.test/api/payments?start=1000&end=2000&received=1",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
      )
      expect(payments.map((p) => p.id)).toEqual(["p1"])
    })

    it("fails loudly on an unexpected shape instead of reconciling nothing", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([{ hash: "abc", amount: 1000 }]))
      await expect(client.listPayments()).rejects.toThrow("unexpected shape")
    })

    it("throws on a non-OK response", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

      await expect(client.listPayments()).rejects.toThrow("Coinos payments list failed with status 401")
    })
  })
})
