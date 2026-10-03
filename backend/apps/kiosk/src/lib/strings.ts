/** Spanish (Bolivia) UI text. Product and category names come from Medusa; write them in Spanish in the admin. */
export const t = {
  title: "¿Algo para recargar?",
  all: "Todo",
  tapToStart: "Toca para empezar",
  orderLabel: "Tu pedido",
  orderEmpty: "Elige algo para empezar",
  pay: "Pagar",
  soldOut: "Agotado",
  add: (name: string) => `Añadir ${name}`,
  remove: (name: string) => `Quitar un ${name}`,
  inOrder: (n: number) => `${n} en tu pedido`,
  items: (n: number) => (n === 1 ? "1 producto" : `${n} productos`),
  emptyCategory: "No hay productos en esta categoría por ahora.",
  loadError: "No pudimos cargar los productos. Toca para reintentar.",
  currency: "Bs",
  // Added for the payment-method screen (the kit has no concept of payment methods).
  choosePayment: "¿Cómo quieres pagar?",
  payWithLightning: "Pagar con Lightning",
  payWithBankQr: "Pagar con QR bancario",
  back: "Atrás",
} as const
