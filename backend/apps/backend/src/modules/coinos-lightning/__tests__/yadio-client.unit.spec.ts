import { YadioClient } from "../lib/yadio-client"

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

describe("YadioClient", () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
  })

  it("fetches BTC-per-BOB from /rate/BTC/BOB and converts to sats", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rate: 0.000001, timestamp: Date.now() }))
    const client = new YadioClient({ baseUrl: "https://yadio.test", fetchImpl: fetchMock as unknown as typeof fetch })

    const rate = await client.getRate()

    expect(fetchMock).toHaveBeenCalledWith("https://yadio.test/rate/BTC/BOB")
    expect(rate.btcPerBob).toBe(0.000001)
    expect(client.satsForBob(10, rate)).toBe(1000)
  })

  it("caches the rate for repeated calls within the TTL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rate: 0.000001 }))
    const client = new YadioClient({
      baseUrl: "https://yadio.test",
      cacheTtlMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await client.getRate()
    await client.getRate()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refetches once the cache is stale", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rate: 0.000001 }))
    const client = new YadioClient({
      baseUrl: "https://yadio.test",
      cacheTtlMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await client.getRate()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await client.getRate()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws when the cache is stale and Yadio is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"))
    const client = new YadioClient({ baseUrl: "https://yadio.test", fetchImpl: fetchMock as unknown as typeof fetch })

    await expect(client.getRate()).rejects.toThrow("network down")
  })

  it("rejects a non-numeric or non-positive rate", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rate: -1 }))
    const client = new YadioClient({ baseUrl: "https://yadio.test", fetchImpl: fetchMock as unknown as typeof fetch })

    await expect(client.getRate()).rejects.toThrow("Yadio returned an invalid rate")
  })

  describe("isAvailable", () => {
    it("returns true when a rate can be fetched", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ rate: 0.000001 }))
      const client = new YadioClient({ baseUrl: "https://yadio.test", fetchImpl: fetchMock as unknown as typeof fetch })

      await expect(client.isAvailable()).resolves.toBe(true)
    })

    it("returns false, never throws, when Yadio is unreachable and the cache is stale", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"))
      const client = new YadioClient({ baseUrl: "https://yadio.test", fetchImpl: fetchMock as unknown as typeof fetch })

      await expect(client.isAvailable()).resolves.toBe(false)
    })
  })
})
