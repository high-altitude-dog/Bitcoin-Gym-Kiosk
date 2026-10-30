import { clearProgress, formatTimings, progressToken, readProgress, startProgress, track } from "../invoice-progress"

describe("invoice progress", () => {
  beforeEach(() => clearProgress())

  it("accepts only well-formed tokens", () => {
    expect(progressToken({ progress_token: "abcdef0123456789-_xyz" })).toBe("abcdef0123456789-_xyz")
    expect(progressToken({ progress_token: "short" })).toBeNull()
    expect(progressToken({ progress_token: "has spaces in it 1234" })).toBeNull()
    expect(progressToken({})).toBeNull()
    expect(progressToken(undefined)).toBeNull()
  })

  it("records pending, then done with the time, then failed, per service", async () => {
    const token = "tok_0123456789abcdef"
    const timings: Record<string, number | string> = {}
    startProgress(token, ["yadio", "coinos", "bark"])
    expect(readProgress(token)).toEqual({ yadio: { state: "pending" }, coinos: { state: "pending" }, bark: { state: "pending" } })

    await track(token, "yadio", timings, async () => 1)
    expect(readProgress(token)?.yadio?.state).toBe("done")
    expect(typeof readProgress(token)?.yadio?.ms).toBe("number")

    await expect(track(token, "bark", timings, async () => { throw new Error("down") })).rejects.toThrow("down")
    expect(readProgress(token)?.bark?.state).toBe("failed")
    expect(readProgress(token)?.coinos?.state).toBe("pending")
    expect(formatTimings(timings)).toMatch(/^yadio \d+ ms, bark \d+ \(failed\) ms$/)
  })

  it("does nothing without a token, and knows nothing about unknown ones", async () => {
    await track(null, "coinos", {}, async () => 1)
    expect(readProgress("tok_unknown_0123456789")).toBeNull()
  })
})
