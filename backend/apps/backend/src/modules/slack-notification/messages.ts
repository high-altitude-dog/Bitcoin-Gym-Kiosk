// Spanish Slack messages for the kiosk's alerts. Pure functions of the
// notification's `data`, so they're testable without Slack or Medusa.

export type OrderPlacedData = {
  display_id: number
  total: number
  items: { title: string; quantity: number }[]
  payment_method: "lightning" | "bank_qr" | "other"
  sats?: number | null
  admin_url?: string | null
}

export type LowStockData = {
  display_id: number
  items: { title: string; available: number }[]
}

export type PaidWithoutOrderData = {
  cart_id: string
  amount: number
  sats?: number | null
  minutes_waiting: number
}

export type ReconciliationMismatchData = {
  date: string
  unmatched_coinos: { hash?: string | null; memo?: string | null; amount?: number | null }[]
  captured_without_coinos: string[]
}

export const SLACK_TEMPLATES = [
  "order-placed",
  "low-stock",
  "paid-without-order",
  "reconciliation-mismatch",
] as const
export type SlackTemplate = (typeof SLACK_TEMPLATES)[number]

const MAX_LISTED = 10

// Slack treats &, < and > as control characters in message text.
export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function formatBs(amount: number): string {
  const formatted = new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `Bs ${formatted}`
}

export function formatSats(sats: number): string {
  return `${new Intl.NumberFormat("es-BO").format(sats)} sats`
}

function paymentLabel(data: OrderPlacedData): string {
  if (data.payment_method === "lightning") {
    return data.sats ? `Lightning (${formatSats(data.sats)})` : "Lightning"
  }
  if (data.payment_method === "bank_qr") return "QR bancario"
  return "otro medio de pago"
}

function listed<T>(items: T[], line: (item: T) => string): string[] {
  const lines = items.slice(0, MAX_LISTED).map(line)
  if (items.length > MAX_LISTED) lines.push(`• y ${items.length - MAX_LISTED} más`)
  return lines
}

export function orderPlacedMessage(data: OrderPlacedData): string {
  const lines = [
    `*Venta #${data.display_id}* · ${formatBs(data.total)} · ${paymentLabel(data)}`,
    ...listed(data.items, (i) => `• ${i.quantity} × ${escapeSlack(i.title)}`),
  ]
  if (data.admin_url) lines.push(`<${data.admin_url}|Ver pedido en el admin>`)
  return lines.join("\n")
}

export function lowStockMessage(data: LowStockData): string {
  return [
    `*Stock bajo* tras la venta #${data.display_id}:`,
    ...listed(data.items, (i) =>
      i.available <= 0
        ? `• ${escapeSlack(i.title)}: *agotado*`
        : `• ${escapeSlack(i.title)}: quedan ${i.available}`
    ),
  ].join("\n")
}

export function paidWithoutOrderMessage(data: PaidWithoutOrderData): string {
  const amount = data.sats ? `${formatBs(data.amount)} (${formatSats(data.sats)})` : formatBs(data.amount)
  return [
    `*Pago confirmado sin pedido* desde hace ${data.minutes_waiting} min · ${amount}`,
    `El cliente pagó por Lightning, pero el pedido no se completó. Revisar y completar el pedido o reembolsar manualmente.`,
    `Referencia del carrito (la misma que muestra el kiosko): \`${escapeSlack(data.cart_id)}\``,
  ].join("\n")
}

export function reconciliationMismatchMessage(data: ReconciliationMismatchData): string {
  const lines = [`*Conciliación Coinos del ${data.date}*: hay diferencias.`]
  if (data.unmatched_coinos.length) {
    lines.push(`${data.unmatched_coinos.length} pago(s) recibido(s) en Coinos sin pedido en Medusa:`)
    lines.push(
      ...listed(data.unmatched_coinos, (p) => {
        const ref = escapeSlack(p.memo || p.hash || "sin referencia")
        return p.amount ? `• ${formatSats(p.amount)} · \`${ref}\`` : `• \`${ref}\``
      })
    )
  }
  if (data.captured_without_coinos.length) {
    lines.push(`${data.captured_without_coinos.length} pago(s) cobrado(s) en Medusa sin registro en Coinos:`)
    lines.push(...listed(data.captured_without_coinos, (id) => `• \`${escapeSlack(id)}\``))
  }
  return lines.join("\n")
}

export function renderSlackMessage(template: string, data: Record<string, unknown>): string {
  switch (template as SlackTemplate) {
    case "order-placed":
      return orderPlacedMessage(data as unknown as OrderPlacedData)
    case "low-stock":
      return lowStockMessage(data as unknown as LowStockData)
    case "paid-without-order":
      return paidWithoutOrderMessage(data as unknown as PaidWithoutOrderData)
    case "reconciliation-mismatch":
      return reconciliationMismatchMessage(data as unknown as ReconciliationMismatchData)
    default:
      throw new Error(`slack-notification: unknown template "${template}"`)
  }
}
