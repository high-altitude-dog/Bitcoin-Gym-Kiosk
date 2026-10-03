export function formatBs(amount: number | null | undefined): string {
  if (amount == null) return "--"
  return `Bs ${amount.toFixed(2).replace(/\.00$/, "")}`
}
