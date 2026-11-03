// What a payer sees as the description of a Bitcoin payment (Nov 3, 2026):
// "Armor Gym Calacoto / CoinOS.io <code>" for Coinos, "... / Second.tech <code>"
// for Bark Pay (Ark), where <code> is the payment session id without its
// "payses_" prefix (26 characters in practice). The session id is still what
// ties a payment back to its cart, so the webhook reads it back out of the memo.

export const MEMO_PLACE = "Armor Gym Calacoto"
export type MemoSource = "CoinOS.io" | "Second.tech"

const PREFIX = "payses_"
const MEMO = /^Armor Gym Calacoto \/ (?:CoinOS\.io|Second\.tech) ([0-9A-Za-z]+)$/

/** "Armor Gym Calacoto / CoinOS.io 01M6HCMSWMJJE8H56BXFKN59P3" for session `payses_01M6HCMSWMJJE8H56BXFKN59P3`. */
export function paymentMemo(source: MemoSource, sessionId: string): string {
  const code = sessionId.startsWith(PREFIX) ? sessionId.slice(PREFIX.length) : sessionId
  return `${MEMO_PLACE} / ${source} ${code}`
}

/**
 * The payment session id in a memo Coinos echoes back. A memo that isn't in
 * the new format (invoices created before it, holding the bare session id) is
 * returned unchanged.
 */
export function sessionIdFromMemo(memo: unknown): string {
  if (typeof memo !== "string") return ""
  const match = MEMO.exec(memo.trim())
  return match ? `${PREFIX}${match[1]}` : memo
}
