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
