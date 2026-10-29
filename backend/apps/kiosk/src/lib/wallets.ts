import type { InvoiceMethod } from "./payment"

// Wallets suggested on each Bitcoin QR screen (the developer's picks, Oct 29,
// 2026). `logo` is a file under public/kiosk/wallets/; until a wallet has
// one, its tile shows its initial.
export type Wallet = { name: string; logo?: string }

export const WALLETS = {
  phoenix: { name: "Phoenix" },
  blink: { name: "Blink" },
  binance: { name: "Binance" },
  arke: { name: "Arké" },
  noah: { name: "Noah" },
} satisfies Record<string, Wallet>

export type WalletId = keyof typeof WALLETS

export const SUGGESTED_WALLETS: Record<InvoiceMethod, WalletId[]> = {
  // "Pagar con Bitcoin - Bolt11"
  lightning: ["phoenix", "blink", "binance"],
  // "Pagar con Bitcoin Ark/Bolt11"
  ark: ["arke", "noah"],
  // "Pagar con Bitcoin (Bolt12/Ark)"
  bip321: ["arke", "noah", "phoenix"],
}
