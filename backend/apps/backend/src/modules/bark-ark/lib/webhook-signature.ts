import { createHmac, timingSafeEqual } from "crypto"

const TOLERANCE_SECONDS = 300

// Bark Pay signs each webhook delivery Stripe-style: a `Bark-Signature` header
// of `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`
// (https://second.tech/docs/bark-pay/integrate.md, "Listen for webhooks").
// Checked against the raw body, before any JSON parsing; old timestamps are
// refused so a captured delivery can't be replayed later.
export function verifyBarkSignature(
  header: unknown,
  rawBody: string,
  secret: string,
  nowSeconds = Date.now() / 1000
): boolean {
  if (typeof header !== "string" || !header) return false
  const parts: Record<string, string[]> = {}
  for (const part of header.split(",")) {
    const i = part.indexOf("=")
    if (i <= 0) continue
    const key = part.slice(0, i).trim()
    ;(parts[key] ??= []).push(part.slice(i + 1).trim())
  }
  const t = parts.t?.[0]
  const signatures = parts.v1 ?? []
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false
  if (Math.abs(nowSeconds - Number(t)) > TOLERANCE_SECONDS) return false

  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"))
  return signatures.some((sig) => {
    const given = Buffer.from(sig)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
