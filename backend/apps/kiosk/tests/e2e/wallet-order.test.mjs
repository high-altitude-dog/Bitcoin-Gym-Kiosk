// The suggested wallets on the Bitcoin QR screens are shuffled per invoice
// (walletOrder in src/lib/wallets.ts): the same QR keeps its order, a new one
// gets a fresh shuffle, and every order is equally likely. No browser needed.
import { createChecker } from "./support.mjs"
import { SUGGESTED_WALLETS, walletOrder } from "../../src/lib/wallets.ts"

const { check, finish } = createChecker()

const first = walletOrder("lightning", "lightning:lnbc1aaa")
check("same wallets as suggested", [...first].sort().join() === [...SUGGESTED_WALLETS.lightning].sort().join(), first.join())
check("the same QR keeps its order", walletOrder("lightning", "lightning:lnbc1aaa").join() === first.join())
check("the suggested list itself is untouched", SUGGESTED_WALLETS.lightning.join() === "phoenix,coinos,blink,binance")

const counts = new Map()
const firsts = new Map()
const N = 24000
for (let i = 0; i < N; i++) {
  const ids = walletOrder("lightning", `lightning:lnbc1-${i}`)
  counts.set(ids.join(), (counts.get(ids.join()) ?? 0) + 1)
  firsts.set(ids[0], (firsts.get(ids[0]) ?? 0) + 1)
}
const spread = [...counts.values()]
check("new QRs get all 24 orders of 4 wallets", counts.size === 24, String(counts.size))
check("each order about equally often (within 20% of 1000)", spread.every((c) => c > 800 && c < 1200), `${Math.min(...spread)}-${Math.max(...spread)}`)
check("each wallet first about a quarter of the time", [...firsts.values()].every((c) => c > 5400 && c < 6600), JSON.stringify(Object.fromEntries(firsts)))

finish()
