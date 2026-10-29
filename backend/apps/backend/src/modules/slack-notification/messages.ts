// Spanish Slack messages for the kiosk's alerts. Pure functions of the
// notification's `data`, so they're testable without Slack or Medusa.

export type OrderPlacedData = {
  display_id: number
  total: number
  items: { title: string; quantity: number }[]
  payment_method: "lightning" | "ark" | "bip321" | "bank_qr" | "cash" | "other"
  // For "bip321": which half of the QR was paid ("ark" or "bolt12").
  paid_rail?: string | null
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

export type UnpaidCashData = {
  display_id: number
  total: number
  minutes_waiting: number
  admin_url?: string | null
}

export type CashAutoPaidData = {
  display_id: number
  total: number
  admin_url?: string | null
}

export type CashCollectData = {
  total: number
  items: { title: string; quantity: number }[]
}

export type HandoverOrderData = {
  display_id: number
  items: { title: string; quantity: number }[]
  admin_url?: string | null
}

export const SLACK_TEMPLATES = [
  "order-placed",
  "low-stock",
  "paid-without-order",
  "reconciliation-mismatch",
  "staff-order",
  "cafe-order",
  "unpaid-cash",
  "cash-auto-paid",
  "cash-collect",
  "cash-collect-cancelled",
] as const
export type SlackTemplate = (typeof SLACK_TEMPLATES)[number]

export type SlackDestination = "kiosk" | "staff" | "cafe"

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
  if (data.payment_method === "ark") {
    return data.sats ? `Bitcoin Ark (${formatSats(data.sats)})` : "Bitcoin Ark"
  }
  if (data.payment_method === "bip321") {
    const parts = [data.sats ? formatSats(data.sats) : null, data.paid_rail === "ark" ? "pagado por Ark" : data.paid_rail === "bolt12" ? "pagado por Bolt12" : null].filter(Boolean)
    return parts.length ? `BIP321 Ark/Bolt12 (${parts.join(", ")})` : "BIP321 Ark/Bolt12"
  }
  if (data.payment_method === "bank_qr") return "QR bancario"
  if (data.payment_method === "cash") return "efectivo, *por cobrar en recepción*"
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
    `El cliente pagó con Bitcoin (Lightning, Ark o BIP321), pero el pedido no se completó. Revisar y completar el pedido o reembolsar manualmente.`,
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

// Items staff hand over (product Type "Entrega del personal").
export function staffOrderMessage(data: HandoverOrderData): string {
  const lines = [
    `*Pedido #${data.display_id} para entregar*`,
    ...listed(data.items, (i) => `• ${i.quantity} × ${escapeSlack(i.title)}`),
    `Marcarlo como entregado en el admin al entregarlo.`,
  ]
  if (data.admin_url) lines.push(`<${data.admin_url}|Ver pedido en el admin>`)
  return lines.join("\n")
}

// Items the partner café makes and delivers (product Type "Café asociado").
// No prices or admin link: the café has no admin access.
export function cafeOrderMessage(data: HandoverOrderData): string {
  return [
    `*Nuevo pedido #${data.display_id}* del kiosko de Armor Gym`,
    ...listed(data.items, (i) => `• ${i.quantity} × ${escapeSlack(i.title)}`),
    `Entregar en la recepción de Armor Gym con el número de pedido #${data.display_id}.`,
  ].join("\n")
}

// A cash order still not captured: the member may not have paid at the
// desk. Its items are held until it is (or it's cancelled, which frees them).
export function cashAutoPaidMessage(data: CashAutoPaidData): string {
  const lines = [
    `*Pedido #${data.display_id} en efectivo dado por pagado* · ${formatBs(data.total)}`,
    `Nadie confirmó ni canceló en el kiosko en 5 minutos, así que se registró como cobrado y entregado. Verificar que el dinero esté en caja.`,
  ]
  if (data.admin_url) lines.push(`<${data.admin_url}|Ver pedido en el admin>`)
  return lines.join("\n")
}

export function cashCollectMessage(data: CashCollectData): string {
  return [
    `*Cobrar ${formatBs(data.total)} en efectivo* (kiosko)`,
    ...listed(data.items, (i) => `• ${i.quantity} × ${escapeSlack(i.title)}`),
  ].join("\n")
}

export function cashCollectCancelledMessage(data: CashCollectData): string {
  return `Cancelado: *no cobrar ${formatBs(data.total)}* (kiosko)`
}

export function unpaidCashMessage(data: UnpaidCashData): string {
  const lines = [
    `*Pedido #${data.display_id} en efectivo sin cobrar* desde hace ${data.minutes_waiting} min · ${formatBs(data.total)}`,
    `Al cobrar, capturar el pago en el admin. Si el cliente no pagó, cancelar el pedido.`,
  ]
  if (data.admin_url) lines.push(`<${data.admin_url}|Ver pedido en el admin>`)
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
    case "staff-order":
      return staffOrderMessage(data as unknown as HandoverOrderData)
    case "cafe-order":
      return cafeOrderMessage(data as unknown as HandoverOrderData)
    case "unpaid-cash":
      return unpaidCashMessage(data as unknown as UnpaidCashData)
    case "cash-auto-paid":
      return cashAutoPaidMessage(data as unknown as CashAutoPaidData)
    case "cash-collect":
      return cashCollectMessage(data as unknown as CashCollectData)
    case "cash-collect-cancelled":
      return cashCollectCancelledMessage(data as unknown as CashCollectData)
    default:
      throw new Error(`slack-notification: unknown template "${template}"`)
  }
}
