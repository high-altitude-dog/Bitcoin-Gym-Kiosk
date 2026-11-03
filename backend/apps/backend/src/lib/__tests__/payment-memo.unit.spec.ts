import { paymentMemo, sessionIdFromMemo } from "../payment-memo"

describe("payment memo", () => {
  const id = "payses_01M6HCMSWMJJE8H56BXFKN59P3"

  it("shows the 26-character code without the payses_ prefix", () => {
    expect(paymentMemo("CoinOS.io", id)).toBe("Armor Gym Calacoto / CoinOS.io 01M6HCMSWMJJE8H56BXFKN59P3")
    expect(paymentMemo("Second.tech", id)).toBe("Armor Gym Calacoto / Second.tech 01M6HCMSWMJJE8H56BXFKN59P3")
  })

  it("gets the session id back from either memo", () => {
    expect(sessionIdFromMemo(paymentMemo("CoinOS.io", id))).toBe(id)
    expect(sessionIdFromMemo(paymentMemo("Second.tech", id))).toBe(id)
  })

  it("still accepts an old memo, which is the bare session id", () => {
    expect(sessionIdFromMemo(id)).toBe(id)
  })

  it("gives nothing for a missing or non-string memo", () => {
    expect(sessionIdFromMemo(undefined)).toBe("")
    expect(sessionIdFromMemo(42)).toBe("")
  })

  it("does not read a session id out of some other text", () => {
    expect(sessionIdFromMemo("Armor Gym Calacoto / Other 01M6HCMSWMJJE8H56BXFKN59P3")).toBe("Armor Gym Calacoto / Other 01M6HCMSWMJJE8H56BXFKN59P3")
  })
})
