// Bank QR ("Pagado") and cash place an order before anyone has checked that
// the money arrived, so only kiosks opened with a known location may use them
// (the developer, Oct 30, 2026: the tablet and remote testers open
// https://paywithbitcoin.lol/?location=calacoto; the worst a stranger who
// learns it can do is put stock levels out). The kiosk sends the location in
// this header; the allowed ones are KIOSK_LOCATIONS in .env, comma-separated.
// With KIOSK_LOCATIONS unset nothing is gated (local development).
export const LOCATION_HEADER = "x-kiosk-location"

// Payment providers whose orders nobody has verified as paid.
export const MANUAL_PROVIDERS = ["pp_system_default", "pp_cash_cash"]

export function allowedLocations(raw: string | undefined = process.env.KIOSK_LOCATIONS): string[] | null {
  const list = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  return list.length ? list : null
}

export function locationAllowed(header: unknown, allowed: string[] | null): boolean {
  if (allowed === null) return true
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === "string" && allowed.includes(value.trim().toLowerCase())
}
