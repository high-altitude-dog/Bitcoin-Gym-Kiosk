import { useSyncExternalStore } from "react"

// The kiosk's text in Spanish (Bolivia, the default) and English. Product
// names come from Medusa as entered in the admin, in Spanish, and are not
// translated; category chips use a category's `name_en` metadata in English
// (categoryName in kioskMapping.ts). The language is chosen with the flags (start screen, shop,
// Wi-Fi screen) and goes back to Spanish whenever the kiosk resets.

const es = {
  title: "¿Algo para recargar?",
  all: "Todo",
  tapToStart: "Toca para empezar",
  orderLabel: "Tu pedido",
  orderEmpty: "Elige algo para empezar",
  orderCountEmpty: "Vacío",
  orderTotal: "Total",
  pay: "Pagar",
  soldOut: "Agotado",
  add: (name: string) => `Añadir ${name}`,
  remove: (name: string) => `Quitar un ${name}`,
  inOrder: (n: number) => `${n} en tu pedido`,
  items: (n: number) => (n === 1 ? "1 producto" : `${n} productos`),
  moreBelow: "Ver más abajo",
  moreAbove: "Ver más arriba",
  greetingMorning: "¡Buenos días!",
  greetingAfternoon: "¡Buenas tardes!",
  greetingEvening: "¡Buenas noches!",
  emptyCategory: "No hay productos en esta categoría por ahora.",
  loadError: "No pudimos cargar los productos. Toca para reintentar.",
  currency: "Bs",
  // Added for the payment-method screen (the kit has no concept of payment methods).
  choosePayment: "¿Cómo quieres pagar?",
  payWithLightning: "Pagar con Bitcoin - Bolt11",
  payWithBankQr: "Pagar con QR bancario",
  payWithCash: "Pagar en efectivo",
  payWithArk: "Pagar con Bitcoin Ark/Bolt11",
  payWithBip321: "Pagar con Bitcoin (Bolt12/Ark)",
  back: "Atrás",
  // Added for App.tsx's loading/retry screen and useKiosk.ts's error
  // messages, the last English text left in the kiosk.
  loading: "Cargando...",
  reconnecting: "Reconectando...",
  retry: "Reintentar",
  retryNow: "Reintentar ahora",
  retryingIn: (seconds: number) => `Reintentando en ${seconds} s`,
  retryingNow: "Reintentando...",
  errorCatalog: "No pudimos conectar con la tienda. Revisa la conexión e intenta de nuevo.",
  errorOrderIncomplete: "El pago se confirmó, pero no pudimos completar el pedido. Avisa a un miembro del personal.",
  errorLightningUnavailable: "El pago con Bitcoin⚡ no está disponible por el momento. Intenta de nuevo en un momento.",
  errorArkUnavailable: "El pago con Bitcoin Ark/Bolt11 no está disponible por el momento. Intenta de nuevo en un momento.",
  errorBip321Unavailable: "El pago con Bitcoin (Bolt12/Ark) no está disponible por el momento. Intenta de nuevo en un momento.",
  errorInvoiceFailed: "No pudimos crear la factura de Bitcoin⚡. Intenta de nuevo.",
  errorPayment: "No pudimos preparar el pago. Intenta de nuevo.",
  savingOrder: "Guardando tu pedido…",
  errorCartSync: "No pudimos guardar un cambio en tu pedido. Revisa el total y elige cómo pagar.",
  paid: "Pagado",
  cancel: "Cancelar",
  errorBankQrConfirm: "No pudimos registrar el pago. Intenta de nuevo o avisa a un miembro del personal.",
  // Cash: the order is placed here and paid at the front desk.
  cashTitle: (total: string) => `Pagar ${total} en efectivo`,
  cashNote: "Confirma tu pedido y paga en recepción.",
  cashAutoIn: (time: string) => `Si nadie toca, se dará por pagado en ${time}`,
  confirmOrder: "Confirmar pedido",
  errorCashConfirm: "No pudimos registrar tu pedido. Intenta de nuevo o avisa a un miembro del personal.",
  payAtDesk: "Paga en recepción",
  paymentReceived: "¡Pago recibido!",
  backToStart: "Volver al inicio",
  home: "Inicio",
  connectTitle: "Wi-Fi y acceso al gimnasio",
  wifiLabel: "Wi-Fi del gimnasio",
  wifiNote: "Escanea para conectarte",
  accessLabel: "Acceso al gimnasio",
  accessNote: "Escanea para abrir la app",
  comingSoon: "Próximamente",
  tapToReveal: "Toca para mostrar",
  // The amount stays (a static QR has none); its space can't break, so "Bs" and the number stay together.
  bankQrNote: (total: string) => `Escanea y paga ${total.replace(" ", "\u00a0")} con la app de tu banco.`,
  cashDue: (total: string) => `${total} en efectivo`,
  checkingPayment: "Verificando el pago...",
  cartReference: (id: string) => `Referencia: ${id}`,
  // Done screen: what the member takes, and what is brought to them.
  takeYourItems: "Toma tus productos",
  yourPurchase: "Tu compra",
  deliveredByStaff: "Te lo entrega el personal",
  deliveredByCafe: "Llega a recepción",
  // Payment and thank-you screens (were written inline in the components).
  payAmount: (total: string) => `Pagar ${total}`,
  invoiceExpired: "La factura venció",
  invoiceExpiredNote: "La factura de Bitcoin⚡ no se pagó a tiempo.",
  tryAgain: "Intentar de nuevo",
  creatingInvoice: "Creando la factura de Bitcoin⚡...",
  generatingQr: "Generando código QR...",
  expiresIn: (time: string) => `Vence en ${time}`,
  scanLightning: "Escanea con billetera Bitcoin Lightning",
  lightningQrAlt: "Código QR de la factura de Bitcoin⚡",
  scanArk: "Escanea con billetera Bitcoin Ark o Lightning",
  arkQrAlt: "Código QR de pago con Bitcoin Ark",
  scanBip321: "Escanea con billetera Bitcoin Ark o Bolt12",
  bip321QrAlt: "Código QR de pago BIP321 con Ark y Bolt12",
  // The pills where the Lightning logo sits on the QR screen.
  arkMark: "Bitcoin Ark/Bolt11",
  bip321Mark: "Bitcoin (Bolt12/Ark)",
  bankQrAlt: "Código QR bancario del gimnasio",
  thanks: "¡Gracias!",
  yourOrder: "Tu pedido",
  newOrder: "Nuevo pedido",
  // The language flags.
  langEs: "Español",
  langEn: "English",
}

export type Strings = typeof es

const en: Strings = {
  title: "Need a boost?",
  all: "All",
  tapToStart: "Tap to start",
  orderLabel: "Your order",
  orderEmpty: "Pick something to start",
  orderCountEmpty: "Empty",
  orderTotal: "Total",
  pay: "Pay",
  soldOut: "Sold out",
  add: (name: string) => `Add ${name}`,
  remove: (name: string) => `Remove one ${name}`,
  inOrder: (n: number) => `${n} in your order`,
  items: (n: number) => (n === 1 ? "1 item" : `${n} items`),
  moreBelow: "See more below",
  moreAbove: "See more above",
  greetingMorning: "Good morning!",
  greetingAfternoon: "Good afternoon!",
  greetingEvening: "Good evening!",
  emptyCategory: "No products in this category for now.",
  loadError: "We couldn't load the products. Tap to try again.",
  currency: "Bs",
  choosePayment: "How would you like to pay?",
  payWithLightning: "Pay with Bitcoin - Bolt11",
  payWithBankQr: "Pay with bank QR",
  payWithCash: "Pay with cash",
  payWithArk: "Pay with Bitcoin Ark/Bolt11",
  payWithBip321: "Pay with Bitcoin (Bolt12/Ark)",
  back: "Back",
  loading: "Loading...",
  reconnecting: "Reconnecting...",
  retry: "Try again",
  retryNow: "Try now",
  retryingIn: (seconds: number) => `Trying again in ${seconds} s`,
  retryingNow: "Trying again...",
  errorCatalog: "We couldn't reach the shop. Check the connection and try again.",
  errorOrderIncomplete: "Your payment went through, but we couldn't complete the order. Please tell a member of staff.",
  errorLightningUnavailable: "Bitcoin⚡ payments aren't available right now. Please try again in a moment.",
  errorArkUnavailable: "Bitcoin Ark/Bolt11 payments aren't available right now. Please try again in a moment.",
  errorBip321Unavailable: "Bitcoin (Bolt12/Ark) payments aren't available right now. Please try again in a moment.",
  errorInvoiceFailed: "We couldn't create the Bitcoin⚡ invoice. Please try again.",
  errorPayment: "We couldn't prepare the payment. Please try again.",
  savingOrder: "Saving your order…",
  errorCartSync: "We couldn't save a change to your order. Check the total and choose how to pay.",
  paid: "Paid",
  cancel: "Cancel",
  errorBankQrConfirm: "We couldn't record the payment. Try again or tell a member of staff.",
  cashTitle: (total: string) => `Pay ${total} in cash`,
  cashNote: "Confirm your order and pay at the front desk.",
  cashAutoIn: (time: string) => `If nobody taps, it counts as paid in ${time}`,
  confirmOrder: "Confirm order",
  errorCashConfirm: "We couldn't record your order. Try again or tell a member of staff.",
  payAtDesk: "Pay at the front desk",
  paymentReceived: "Payment received!",
  backToStart: "Back to start",
  home: "Home",
  connectTitle: "Wi-Fi and gym access",
  wifiLabel: "Gym Wi-Fi",
  wifiNote: "Scan to connect",
  accessLabel: "Gym access",
  accessNote: "Scan to open the app",
  comingSoon: "Coming soon",
  tapToReveal: "Tap to reveal",
  bankQrNote: (total: string) => `Scan and pay ${total.replace(" ", "\u00a0")} with your bank app.`,
  cashDue: (total: string) => `${total} in cash`,
  checkingPayment: "Checking the payment...",
  cartReference: (id: string) => `Reference: ${id}`,
  takeYourItems: "Take your items",
  yourPurchase: "Your purchase",
  deliveredByStaff: "Staff will bring it to you",
  deliveredByCafe: "Arrives at the front desk",
  payAmount: (total: string) => `Pay ${total}`,
  invoiceExpired: "The invoice expired",
  invoiceExpiredNote: "The Bitcoin⚡ invoice wasn't paid in time.",
  tryAgain: "Try again",
  creatingInvoice: "Creating the Bitcoin⚡ invoice...",
  generatingQr: "Generating QR code...",
  expiresIn: (time: string) => `Expires in ${time}`,
  scanLightning: "Scan with a Bitcoin Lightning wallet",
  lightningQrAlt: "Bitcoin⚡ invoice QR code",
  scanArk: "Scan with a Bitcoin Ark or Lightning wallet",
  arkQrAlt: "Bitcoin Ark payment QR code",
  scanBip321: "Scan with a Bitcoin Ark or Bolt12 wallet",
  bip321QrAlt: "BIP321 payment QR code with Ark and Bolt12",
  arkMark: "Bitcoin Ark/Bolt11",
  bip321Mark: "Bitcoin (Bolt12/Ark)",
  bankQrAlt: "The gym's bank QR code",
  thanks: "Thank you!",
  yourOrder: "Your order",
  newOrder: "New order",
  langEs: "Español",
  langEn: "English",
}

export type Lang = "es" | "en"
const DICTIONARIES: Record<Lang, Strings> = { es, en }
let current: Lang = "es"
const listeners = new Set<() => void>()

/** The current language's text. A live binding: it changes when setLang is called. */
export let t: Strings = es

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  t = DICTIONARIES[lang]
  if (typeof document !== "undefined") document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

/** The current language; a component using it re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
