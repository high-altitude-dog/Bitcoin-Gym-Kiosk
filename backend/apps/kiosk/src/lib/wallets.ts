import type { InvoiceMethod } from "./payment"

// Wallets suggested on each Bitcoin QR screen (the developer's picks, Oct 29,
// 2026). `logo` is a file under public/kiosk/wallets/: a 256 px square tile,
// each brand's icon on its own background, cropped from the logos the
// developer sent (Arké has no icon: a square of its photo around the
// wordmark). Without one, the tile shows the wallet's initial.
export type Wallet = { name: string; logo?: string }

export const WALLETS = {
  phoenix: { name: "Phoenix", logo: "phoenix.webp" },
  blink: { name: "Blink", logo: "blink.webp" },
  binance: { name: "Binance", logo: "binance.webp" },
  arke: { name: "Arké", logo: "arke.webp" },
  noah: { name: "Noah", logo: "noah.webp" },
  // Pays Bolt11, Bolt12 and Ark (the developer, Oct 29, 2026), so it is on every screen.
  coinos: { name: "coinos.io", logo: "coinos.webp" },
} satisfies Record<string, Wallet>

export type WalletId = keyof typeof WALLETS

export const SUGGESTED_WALLETS: Record<InvoiceMethod, WalletId[]> = {
  // "Pagar con Bitcoin - Bolt11"
  lightning: ["phoenix", "coinos", "blink", "binance"],
  // "Pagar con Bitcoin Ark/Bolt11"
  ark: ["arke", "noah", "coinos"],
  // "Pagar con Bitcoin - Bolt12/Ark"
  bip321: ["arke", "noah", "phoenix", "coinos"],
}

// The order is shuffled for every new invoice, so no wallet always comes
// first (the developer, Oct 30, 2026). It is kept per QR: re-renders, a turn
// of the tablet, and the same invoice shown again after "Cancelar" keep it.
const orders = new Map<string, WalletId[]>()

export function walletOrder(method: InvoiceMethod, qr: string, random: () => number = Math.random): WalletId[] {
  const kept = orders.get(qr)
  if (kept) return kept
  const ids = [...SUGGESTED_WALLETS[method]]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  // A handful is plenty: a kiosk only ever has one or two invoices alive.
  if (orders.size >= 8) orders.delete(orders.keys().next().value!)
  orders.set(qr, ids)
  return ids
}

// What a member sees on tapping a wallet's logo (the wallet details card,
// WalletCard.tsx). Facts agreed with the developer on Oct 30, 2026. `stars` is
// the developer's overall sovereignty score out of 5; `points` are the five
// things it looks at (sovereigntyPoints in strings.ts), shown as ticks under
// "¿Qué es esto?". The score is a judgement, not a count of the ticks.
// Binance's minimum Lightning withdrawal (reported at 1,000-2,000 sats) is
// unconfirmed, so it isn't shown yet.
export type WalletInfo = {
  android: boolean
  ios: boolean
  web: boolean
  platformNote?: string
  spanish: boolean
  english: boolean
  selfCustody: boolean
  custody: { es: string; en: string }
  canBuy: boolean
  buy: { es: string; en: string }
  site: string
  beta: boolean
  stars: number
  points: [boolean, boolean, boolean, boolean, boolean]
}

const NO = { es: "No", en: "No" }
const YOURS = { es: "Tú (tus llaves)", en: "You (your keys)" }

export const WALLET_INFO: Record<WalletId, WalletInfo> = {
  phoenix: {
    android: true, ios: true, web: false, spanish: true, english: true,
    selfCustody: true, custody: YOURS, canBuy: false, buy: NO,
    site: "phoenix.acinq.co", beta: false, stars: 4, points: [true, true, true, true, false],
  },
  coinos: {
    android: true, ios: false, web: true, spanish: true, english: true,
    selfCustody: false,
    custody: { es: "coinos, con auto-sweep a otra billetera", en: "coinos, with auto-sweep to another wallet" },
    canBuy: false, buy: NO, site: "coinos.io", beta: false, stars: 4, points: [true, true, true, true, false],
  },
  blink: {
    android: true, ios: true, web: false, spanish: true, english: true,
    selfCustody: false, custody: { es: "Blink, vía Spark", en: "Blink, via Spark" },
    canBuy: false, buy: NO, site: "blink.sv", beta: false, stars: 2, points: [false, false, true, false, false],
  },
  binance: {
    android: true, ios: true, web: true, spanish: true, english: true,
    selfCustody: false, custody: { es: "Binance (pide documento)", en: "Binance (asks for ID)" },
    canBuy: true, buy: { es: "Sí, con bolivianos (P2P)", en: "Yes, with bolivianos (P2P)" },
    site: "binance.com", beta: false, stars: 2, points: [false, false, false, false, false],
  },
  arke: {
    android: false, ios: true, web: false, platformNote: "TestFlight · iOS 26+", spanish: false, english: true,
    selfCustody: true, custody: YOURS, canBuy: false, buy: NO,
    site: "arke.cash", beta: true, stars: 4, points: [true, true, true, true, false],
  },
  noah: {
    android: true, ios: true, web: false, spanish: true, english: true,
    selfCustody: true,
    custody: { es: "Tú (su servidor te ayuda a renovar)", en: "You (its server helps renew your coins)" },
    canBuy: false, buy: NO, site: "beta.noahwallet.io", beta: true, stars: 4, points: [true, true, true, true, false],
  },
}
