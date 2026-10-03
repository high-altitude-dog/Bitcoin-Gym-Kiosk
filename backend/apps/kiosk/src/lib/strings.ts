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
  // Added for App.tsx's loading/retry screen and useKiosk.ts's error
  // messages, the last English text left in the kiosk.
  loading: "Cargando...",
  reconnecting: "Reconectando...",
  retry: "Reintentar",
  errorCatalog: "No pudimos conectar con la tienda. Revisa la conexión e intenta de nuevo.",
  errorOrderIncomplete: "El pago se confirmó, pero no pudimos completar el pedido. Avisa a un miembro del personal.",
  errorLightningUnavailable: "El pago con Lightning no está disponible por el momento. Intenta de nuevo en un momento.",
  errorInvoiceFailed: "No pudimos crear la factura Lightning. Intenta de nuevo.",
  errorPayment: "No pudimos preparar el pago. Intenta de nuevo.",
  checkingPayment: "Verificando el pago...",
  cartReference: (id: string) => `Referencia: ${id}`,
} as const
