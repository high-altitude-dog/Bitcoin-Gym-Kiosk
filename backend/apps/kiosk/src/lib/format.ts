import { KIOSK } from "./stageConfig"

/** Medusa v2 stores amounts in major units (25 = Bs 25). Returns just the number part, e.g. "25" or "12,50". */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(KIOSK.locale, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
