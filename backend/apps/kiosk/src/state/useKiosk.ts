import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { isHttpError, sdk } from "../lib/medusa"
import { toKioskCart } from "../lib/kioskMapping"
import { setLang, t } from "../lib/strings"
import {
  BARK_ARK_PROVIDER_ID,
  BIP321_PROVIDER_ID,
  CASH_PAYMENT_PROVIDER_ID,
  INVOICE_METHODS,
  INVOICE_PROVIDER_ID,
  MANUAL_PAYMENT_PROVIDER_ID,
  readLightningInvoice,
  type InvoiceMethod,
  type LightningInvoice,
} from "../lib/payment"

export type Screen = "idle" | "connect" | "shop" | "payment-method" | "payment" | "done"
// "confirmed": the Lightning payment is confirmed and the order is being
// created; the done screen shows "¡Pago recibido!" and fills in the order
// once it exists (about a second later).
// "needs_staff": the payment was confirmed but the order could not be
// completed. The member has paid, so the kiosk must not offer to pay again
// or reset itself until staff step in.
export type PaymentStatus = "awaiting" | "confirmed" | "expired" | "needs_staff" | null
// "bank_qr" is a placeholder while the Baneco API request is pending: it
// shows a static QR square instead of a real invoice. Swap in the real
// Baneco flow here once credentials arrive. "cash": the member confirms the
// order here and pays at the front desk; staff capture it in the admin.
// "ark": "Bitcoin Ark", the same invoice flow as "lightning" through our Bark
// Pay (one QR with an Ark address and a Lightning invoice). "bip321": "BIP321
// Ark/Bolt12", the same flow with an Ark address and a Coinos BOLT12 offer.
export type PaymentMethod = "lightning" | "ark" | "bip321" | "bank_qr" | "cash" | null

// "*categories", not "+categories.id,+categories.name": that "+" form returns
// categories as null in Medusa 2.21.2, so no product ever matched a category chip.
const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*images,*categories"
const POLL_INTERVAL_MS = 500
// Byte's magic hoops stay on screen at least this long before the QR, so a
// fast invoice doesn't make him flash on and off.
const MIN_BYTE_MS = 1500
// Keep checking this long past the invoice's deadline before calling it
// expired: a payment sent in the last seconds can settle, and the Coinos
// webhook arrive, a little after the deadline.
const EXPIRY_GRACE_MS = 60_000
// A cart change that times out or loses its connection is retried this many
// times (after reloading the cart) before its taps are given up.
const MAX_SYNC_RETRIES = 1
// The cash screen waits this long for "Confirmar pedido" or "Cancelar". With
// no tap, the order is recorded as paid at the desk and handed over (decided
// Oct 20, 2026): see autoPayCash below and the backend's lib/cash-auto-capture.ts.
export const CASH_AUTO_PAY_MS = 5 * 60_000
const PAYMENT_SESSION_FIELDS =
  "+payment_collection.payment_sessions.status,+payment_collection.payment_sessions.provider_id"

interface KioskState {
  screen: Screen
  region: HttpTypes.StoreRegion | null
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  // Whether the region offers "Bitcoin Ark" (Bark Pay configured on the backend).
  arkEnabled: boolean
  // Whether the region offers "BIP321 Ark/Bolt12".
  bip321Enabled: boolean
  cart: HttpTypes.StoreCart | null
  // Quantities tapped in but not yet confirmed by Medusa, by variant id.
  // The screen shows these at once; syncCart() sends them in the background.
  pending: Record<string, number>
  order: HttpTypes.StoreOrder | null
  invoice: LightningInvoice | null
  // The invoice being created, for the traffic lights on Byte's screen: a random
  // token sent with the request (the server records each outside service's
  // progress under it) and when the request went out (null until then).
  invoiceProgress: { token: string; requestedAt: number | null } | null
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  // The payment button tapped while taps were still being saved: it shows
  // "Guardando tu pedido…" until they are.
  savingFor: PaymentMethod
  // When the cash screen records the order as paid by itself (ms since epoch).
  cashDeadline: number | null
  loading: boolean
  error: string | null
}

// A random token for one invoice request's progress (lib/invoice-progress.ts on the backend).
function newProgressToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "")
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}

export function useKiosk() {
  const [state, setState] = useState<KioskState>({
    screen: "idle",
    region: null,
    products: [],
    categories: [],
    arkEnabled: false,
    bip321Enabled: false,
    cart: null,
    pending: {},
    order: null,
    invoice: null,
    invoiceProgress: null,
    paymentStatus: null,
    paymentMethod: null,
    savingFor: null,
    cashDeadline: null,
    loading: true,
    error: null,
  })

  // The async flows below read these refs rather than `state`, so a tap or
  // a poll tick never acts on a cart/invoice from a render that's out of date.
  const cartRef = useRef<HttpTypes.StoreCart | null>(null)
  const regionRef = useRef<HttpTypes.StoreRegion | null>(null)
  const invoiceRef = useRef<LightningInvoice | null>(null)
  // The invoice method last asked for, so "Intentar de nuevo" makes the same kind.
  const invoiceMethodRef = useRef<InvoiceMethod>("lightning")
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingRef = useRef<Record<string, number>>({})
  const syncQueuedRef = useRef(false)
  // Counts the times unsent taps were given up. "Pagar" notes the count, and
  // a payment button that finds it changed stops to show the real total.
  const droppedTapsRef = useRef(0)
  const dropsAtPagarRef = useRef(0)
  // Bumped on every screen change the member makes, so a payment button
  // still waiting for the cart drops out if the member has moved on.
  const navRef = useRef(0)
  // Bank QR and cash: the cart being made ready (taps saved, pickup shipping
  // attached) while their screen is already showing; "Pagado" and
  // "Confirmar pedido" wait for it. Resolves to null if it failed.
  const manualPrepRef = useRef<Promise<HttpTypes.StoreCart | null> | null>(null)
  // The open cash screen (its deadline, as an id) and whether the front desk
  // was told to collect for it, so "Cancelar" only says "no cobrar" after a
  // "cobrar". Cleared when the screen closes any other way.
  const cashOpenRef = useRef<string | null>(null)
  const cashToldRef = useRef<string | null>(null)
  // Bumped by reset(): work started for the previous member checks it and
  // drops its result instead of writing into the next member's session.
  const epochRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollBusyRef = useRef(false)
  const confirmingRef = useRef(false)

  const commitCart = useCallback((cart: HttpTypes.StoreCart | null) => {
    cartRef.current = cart
    setState((s) => ({ ...s, cart }))
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const loadCatalog = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { regions } = await sdk.store.region.list()
      const region = regions[0] ?? null
      regionRef.current = region
      const [{ products }, { product_categories }, providers] = await Promise.all([
        sdk.store.product.list({
          region_id: region?.id,
          fields: PRODUCT_FIELDS,
        }),
        sdk.store.category.list({
          // metadata.name_en: the English chip label (see categoryName).
          fields: "id,name,rank,parent_category_id,metadata",
          limit: 50,
        }),
        // Hidden, not an error, if this lookup fails.
        sdk.store.payment
          .listPaymentProviders({ region_id: region?.id ?? "" })
          .then(({ payment_providers }) => new Set(payment_providers.map((p) => p.id)))
          .catch(() => new Set<string>()),
      ])
      const categories = product_categories
        .filter((c) => !c.parent_category_id)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      const arkEnabled = providers.has(BARK_ARK_PROVIDER_ID)
      const bip321Enabled = providers.has(BIP321_PROVIDER_ID)
      setState((s) => ({ ...s, region, products, categories, arkEnabled, bip321Enabled, loading: false }))
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: t.errorCatalog,
      }))
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  // Cart changes run one at a time, in order. Two quick taps would otherwise
  // both see "no cart yet", create two carts, and lose the first item.
  const enqueue = useCallback(
    (op: (isCurrent: () => boolean) => Promise<void>) => {
      const epoch = epochRef.current
      const isCurrent = () => epoch === epochRef.current
      const run = queueRef.current.then(async () => {
        if (!isCurrent()) return
        try {
          await op(isCurrent)
        } catch {
          // Resync so the screen shows what the cart really holds.
          const id = cartRef.current?.id
          if (!id) return
          try {
            const { cart } = await sdk.store.cart.retrieve(id)
            if (isCurrent()) commitCart(cart)
          } catch {
            // Offline: the "Reconnecting..." banner already says so.
          }
        }
      })
      queueRef.current = run
      return run
    },
    [commitCart]
  )

  const dropUnsentTaps = useCallback(() => {
    pendingRef.current = {}
    droppedTapsRef.current += 1
    setState((s) => ({ ...s, pending: {} }))
  }, [])

  // Sends the tapped-in quantities to Medusa one change at a time, until the
  // cart matches what the member sees. Taps that land while a request is in
  // flight are picked up by the same loop, so a burst of taps costs one
  // request per product, not one per tap. Each change takes about a second
  // from the tablet, which is why the screen doesn't wait for it.
  const syncCart = useCallback(
    async (isCurrent: () => boolean) => {
      syncQueuedRef.current = false
      let retries = 0
      for (;;) {
        if (!isCurrent()) return
        const cart = cartRef.current
        const change = nextCartChange(cart, pendingRef.current)
        if (!change) {
          pendingRef.current = {}
          setState((s) => ({ ...s, pending: {} }))
          return
        }
        try {
          if (!cart) {
            const { cart: created } = await sdk.store.cart.create({ region_id: regionRef.current?.id })
            if (isCurrent()) commitCart(created)
            continue
          }
          const { variantId, lineItemId, quantity } = change
          let updated: HttpTypes.StoreCart | undefined
          if (!lineItemId) {
            ;({ cart: updated } = await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity }))
          } else if (quantity === 0) {
            ;({ parent: updated } = await sdk.store.cart.deleteLineItem(cart.id, lineItemId))
          } else {
            ;({ cart: updated } = await sdk.store.cart.updateLineItem(cart.id, lineItemId, { quantity }))
          }
          if (!updated) throw new Error("cart change returned no cart")
          if (isCurrent()) commitCart(updated)
        } catch (err) {
          if (!isCurrent()) return
          // Timed out or no connection: the change may or may not have
          // reached Medusa (a reply lost on the wifi looks the same as a
          // request that never left). Each change sets an absolute quantity,
          // so reload the cart and carry on from what it really holds;
          // sending a change twice is harmless. Medusa refusing a change
          // (an error status, e.g. not enough stock) is final.
          if (!isHttpError(err) && retries < MAX_SYNC_RETRIES && cart) {
            retries += 1
            try {
              const { cart: fresh } = await sdk.store.cart.retrieve(cart.id)
              if (isCurrent()) commitCart(fresh)
              continue
            } catch {
              // Still no connection: give up below.
            }
          }
          // Drop the unsent taps; enqueue() then reloads the cart so the
          // screen shows what it really holds.
          dropUnsentTaps()
          throw err
        }
      }
    },
    [commitCart, dropUnsentTaps]
  )

  const setItemQuantity = useCallback(
    (variantId: string, quantity: number) => {
      pendingRef.current = { ...pendingRef.current, [variantId]: Math.max(0, quantity) }
      setState((s) => ({ ...s, pending: pendingRef.current }))
      if (syncQueuedRef.current) return
      syncQueuedRef.current = true
      enqueue(syncCart)
    },
    [enqueue, syncCart]
  )

  // Waits until every queued cart change has reached Medusa, including any
  // tapped in while waiting.
  const settleCart = useCallback(async () => {
    let queue: Promise<unknown>
    do {
      queue = queueRef.current
      await queue
    } while (queue !== queueRef.current)
  }, [])

  // "Pagar" opens the payment-method screen at once, with the order bar's
  // total (the cart plus taps still being saved). It used to wait for the
  // cart to finish saving first, and a reply lost on the gym wifi then left
  // the tap doing nothing at all. The payment buttons wait instead.
  const goToPaymentMethod = useCallback(() => {
    if (toKioskCart(cartRef.current, pendingRef.current, []).itemCount <= 0) return
    navRef.current += 1
    dropsAtPagarRef.current = droppedTapsRef.current
    setState((s) => ({ ...s, error: null, savingFor: null, screen: "payment-method" }))
  }, [])

  const goTo = useCallback((screen: Screen) => {
    navRef.current += 1
    setState((s) => ({ ...s, savingFor: null, screen }))
  }, [])

  // The payment buttons wait here for taps still being saved, so the payment
  // is for the cart the member sees. Returns that cart, or null if the
  // member moved on, or a tap couldn't be saved (the screen then shows the
  // total Medusa really holds and asks them to check it).
  const settleForPayment = useCallback(
    async (method: Exclude<PaymentMethod, null>) => {
      const epoch = epochRef.current
      const nav = navRef.current
      // Only show "Guardando tu pedido…" if there is something left to
      // save, so a normal tap doesn't flash it.
      const saving = Object.keys(pendingRef.current).length > 0
      setState((s) => ({ ...s, error: null, savingFor: saving ? method : null }))
      await settleCart()
      if (epoch !== epochRef.current || nav !== navRef.current) return null
      if (saving) setState((s) => ({ ...s, savingFor: null }))
      if (droppedTapsRef.current !== dropsAtPagarRef.current) {
        dropsAtPagarRef.current = droppedTapsRef.current
        setState((s) => ({ ...s, error: t.errorCartSync }))
        return null
      }
      const cart = cartRef.current
      if (!cart?.items?.length) {
        setState((s) => ({ ...s, screen: "shop" }))
        return null
      }
      return cart
    },
    [settleCart]
  )

  // Polls the cart's payment session rather than repeatedly calling
  // cart.complete(): completing the cart creates the order and reserves
  // stock immediately, even before the invoice is paid (Medusa's documented
  // behavior for async/deferred payment providers). Waiting for the Coinos
  // webhook to mark the session "authorized" first means an abandoned,
  // unpaid invoice never creates an order at all.
  //
  // Once authorized, complete() is retried on every tick until it succeeds:
  // the member has paid, so a wifi blip must never strand them. complete()
  // is idempotent (it returns the existing order if the webhook already
  // completed the cart), so retrying is safe.
  const pollForPayment = useCallback(
    (cartId: string) => {
      stopPolling()
      const epoch = epochRef.current
      pollRef.current = setInterval(async () => {
        // A tick still waiting on the network makes the next one skip, so
        // slow wifi can't pile up overlapping checks or complete() calls.
        if (pollBusyRef.current || epoch !== epochRef.current) return
        pollBusyRef.current = true
        try {
          const { cart } = await sdk.store.cart.retrieve(cartId, {
            fields: PAYMENT_SESSION_FIELDS,
          })
          const session = cart.payment_collection?.payment_sessions?.find((s) =>
            INVOICE_METHODS.some((m) => INVOICE_PROVIDER_ID[m] === s.provider_id)
          )
          if (session?.status === "authorized") {
            const paidWith = INVOICE_METHODS.find((m) => INVOICE_PROVIDER_ID[m] === session.provider_id) ?? "lightning"
            // A Lightning payment is final once confirmed, so say so at once
            // rather than after the order exists (about a second later).
            invoiceRef.current = null
            setState((s) =>
              s.paymentStatus === "confirmed"
                ? s
                : { ...s, screen: "done", order: null, invoice: null, paymentStatus: "confirmed", error: null }
            )
            const result = await sdk.store.cart.complete(cartId)
            if (epoch !== epochRef.current) return
            stopPolling()
            invoiceRef.current = null
            if (result.type === "order") {
              setState((s) => ({
                ...s,
                order: result.order,
                screen: "done",
                paymentStatus: null,
                error: null,
              }))
            } else {
              setState((s) => ({
                ...s,
                error: t.errorOrderIncomplete,
                screen: "payment",
                paymentMethod: paidWith,
                paymentStatus: "needs_staff",
              }))
            }
            return
          }
        } catch {
          // A network blip or a failed complete(): the next tick checks again.
          return
        } finally {
          pollBusyRef.current = false
        }

        // Only now, with the payment confirmed not to have arrived, can the
        // invoice be called expired.
        const invoice = invoiceRef.current
        if (invoice && Date.now() >= invoice.expiresAt + EXPIRY_GRACE_MS) {
          stopPolling()
          invoiceRef.current = null
          setState((s) => ({ ...s, invoice: null, paymentStatus: "expired" }))
        }
      }, POLL_INTERVAL_MS)
    },
    [stopPolling]
  )

  // A cart needs a shipping option to complete regardless of payment
  // method, so both the Lightning and bank QR paths go through this first.
  const ensureShippingMethod = useCallback(async (cart: HttpTypes.StoreCart) => {
    if (cart.shipping_methods?.length) return cart
    const { shipping_options } = await sdk.store.fulfillment.listCartOptions({
      cart_id: cart.id,
    })
    const pickup = shipping_options[0]
    if (!pickup) return cart
    const { cart: updated } = await sdk.store.cart.addShippingMethod(cart.id, {
      option_id: pickup.id,
    })
    return updated
  }, [])

  const initiateLightningPayment = useCallback(
    async (cart: HttpTypes.StoreCart, byteSince = Date.now(), method: InvoiceMethod = "lightning") => {
      const epoch = epochRef.current
      const providerId = INVOICE_PROVIDER_ID[method]
      invoiceMethodRef.current = method
      stopPolling()
      invoiceRef.current = null
      setState((s) => ({
        ...s,
        error: null,
        invoice: null,
        paymentStatus: null,
        paymentMethod: method,
        screen: "payment",
      }))

      try {
        const availability = await sdk.client.fetch<{ available: boolean; ark?: boolean }>(
          "/store/lightning-availability"
        )
        if (epoch !== epochRef.current) return
        // BIP321 needs Bark Pay and a fresh rate, exactly what `ark` reports.
        if (!(method === "lightning" ? availability.available : availability.ark)) {
          setState((s) => ({
            ...s,
            error:
              method === "ark" ? t.errorArkUnavailable : method === "bip321" ? t.errorBip321Unavailable : t.errorLightningUnavailable,
            screen: "payment-method",
          }))
          return
        }

        const progressToken = newProgressToken()
        setState((s) => ({ ...s, invoiceProgress: { token: progressToken, requestedAt: Date.now() } }))
        const { payment_collection } = await sdk.store.payment.initiatePaymentSession(
          cart,
          { provider_id: providerId, data: { progress_token: progressToken } },
          { fields: "+payment_sessions.data,+payment_sessions.provider_id" }
        )
        if (epoch !== epochRef.current) return
        const session = payment_collection.payment_sessions?.find((s) => s.provider_id === providerId)
        const invoice = readLightningInvoice(session?.data, Date.now(), method)
        if (!invoice) {
          throw new Error(`${providerId} did not return invoice data`)
        }
        const wait = MIN_BYTE_MS - (Date.now() - byteSince)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        if (epoch !== epochRef.current) return

        invoiceRef.current = invoice
        cartRef.current = cart
        setState((s) => ({ ...s, cart, invoice, invoiceProgress: null, paymentStatus: "awaiting" }))
        pollForPayment(cart.id)
      } catch {
        if (epoch !== epochRef.current) return
        setState((s) => ({ ...s, error: t.errorInvoiceFailed, invoiceProgress: null, screen: "payment-method" }))
      }
    },
    [pollForPayment, stopPolling]
  )

  const startPayment = useCallback(async (method: InvoiceMethod = "lightning") => {
    const cart = await settleForPayment(method)
    if (!cart) return

    // Coinos can't cancel an invoice, so one replaced by a new invoice stays
    // payable with no order behind it. If the member comes back to the same
    // method with the same total while their invoice is still live, show that
    // one again instead of creating another.
    const live = invoiceRef.current
    if (live && live.method === method && Date.now() < live.expiresAt && live.bobAmount === Number(cart.total)) {
      setState((s) => ({ ...s, error: null, paymentMethod: method, screen: "payment" }))
      return
    }

    // Byte from the tap onwards: the shipping step, the rate check and the
    // invoice all happen behind him.
    const byteSince = Date.now()
    setState((s) => ({
      ...s,
      error: null,
      invoice: null,
      paymentStatus: null,
      paymentMethod: method,
      screen: "payment",
    }))
    try {
      const withShipping = await ensureShippingMethod(cart)
      await initiateLightningPayment(withShipping, byteSince, method)
    } catch {
      setState((s) => ({ ...s, error: t.errorInvoiceFailed, screen: "payment-method" }))
    }
  }, [ensureShippingMethod, initiateLightningPayment, settleForPayment])

  const retryPayment = useCallback(async () => {
    const cart = cartRef.current
    if (!cart) return
    await initiateLightningPayment(cart, Date.now(), invoiceMethodRef.current)
  }, [initiateLightningPayment])

  const startArkPayment = useCallback(() => startPayment("ark"), [startPayment])
  const startBip321Payment = useCallback(() => startPayment("bip321"), [startPayment])

  // Bank QR and cash both open a confirm screen with no invoice. Baneco
  // access is still pending (see CLAUDE.md), so bank QR shows a static
  // placeholder QR. Neither touches a live Lightning invoice or its polling:
  // if the member already paid that invoice, the order still completes.
  // The screen shows at once: the static bank QR and the cash screen don't
  // need the server. Saving taps and attaching pickup shipping (about 1-1.5 s
  // on the VM) run behind it; the confirm buttons wait for them.
  const startManualPayment = useCallback(
    (method: "bank_qr" | "cash") => {
      const epoch = epochRef.current
      const nav = navRef.current
      const cashDeadline = method === "cash" ? Date.now() + CASH_AUTO_PAY_MS : null
      const attempt = cashDeadline ? String(cashDeadline) : null
      cashOpenRef.current = attempt
      cashToldRef.current = null
      setState((s) => ({
        ...s,
        error: null,
        paymentMethod: method,
        screen: "payment",
        cashDeadline,
      }))
      // Something went wrong getting the cart ready: back to the payment
      // choice with the error, as before (unless the member already left).
      const backWithError = (error: string) =>
        setState((s) =>
          epoch === epochRef.current && s.screen === "payment" && s.paymentMethod === method
            ? { ...s, error, screen: "payment-method", cashDeadline: null }
            : s
        )
      const prep = (async () => {
        const cart = await settleForPayment(method)
        if (!cart) {
          // settleForPayment already moved to the shop (empty cart) or set an
          // error for the payment choice.
          if (epoch === epochRef.current && nav === navRef.current) {
            setState((s) => (s.screen === "payment" && s.paymentMethod === method ? { ...s, screen: "payment-method", cashDeadline: null } : s))
          }
          return null
        }
        try {
          const withShipping = await ensureShippingMethod(cart)
          if (epoch !== epochRef.current) return null
          commitCart(withShipping)
          // Cash: tell the front desk how much to collect, now that the cart's
          // total is final (unless the member already left the screen).
          if (attempt && cashOpenRef.current === attempt) {
            cashToldRef.current = attempt
            notifyCashDesk(withShipping.id, attempt, false)
          }
          return withShipping
        } catch {
          backWithError(t.errorPayment)
          return null
        }
      })()
      manualPrepRef.current = prep
      return prep.then(() => undefined)
    },
    [ensureShippingMethod, commitCart, settleForPayment]
  )
  const startBankQrPayment = useCallback(() => startManualPayment("bank_qr"), [startManualPayment])
  const startCashPayment = useCallback(() => startManualPayment("cash"), [startManualPayment])

  // Records the payment with a provider that charges nothing and completes
  // the order.
  // - Bank QR: stand-in for the Baneco webhook. Nothing checks that the
  //   money arrived, so staff must confirm it in the bank app (the Slack
  //   sale alert is the prompt). Replace with the real Baneco confirmation
  //   when the API is available.
  // - Cash: the order is placed with the payment only authorized; staff
  //   capture it in the admin when the member pays at the desk, and only then
  //   is it fulfilled (backend: subscribers/cash-payment-captured.ts).
  const confirmManualPayment = useCallback(
    async (providerId: string, errorMessage: string) => {
      const cart = cartRef.current
      // Two taps in the same instant both get here before the button
      // re-renders as disabled; the second must not start a second session.
      if (!cart || confirmingRef.current) return
      confirmingRef.current = true
      const epoch = epochRef.current
      try {
        // The cart may still be getting ready behind the screen.
        const ready = await manualPrepRef.current
        if (epoch !== epochRef.current || !ready) return
        cashOpenRef.current = null
        await sdk.store.payment.initiatePaymentSession(cartRef.current ?? ready, { provider_id: providerId })
        const result = await sdk.store.cart.complete(cart.id)
        if (epoch !== epochRef.current) return
        if (result.type !== "order") throw new Error("cart did not complete")
        // Any Lightning invoice from earlier in this visit no longer has a
        // session behind it, so stop watching it.
        stopPolling()
        invoiceRef.current = null
        setState((s) => ({ ...s, order: result.order, invoice: null, paymentStatus: null, error: null, screen: "done", cashDeadline: null }))
      } catch {
        if (epoch !== epochRef.current) return
        setState((s) => ({ ...s, error: errorMessage }))
      } finally {
        confirmingRef.current = false
      }
    },
    [stopPolling]
  )
  const confirmBankQrPaid = useCallback(
    () => confirmManualPayment(MANUAL_PAYMENT_PROVIDER_ID, t.errorBankQrConfirm),
    [confirmManualPayment]
  )
  const confirmCashOrder = useCallback(
    () => confirmManualPayment(CASH_PAYMENT_PROVIDER_ID, t.errorCashConfirm),
    [confirmManualPayment]
  )

  // Deliberately keeps a live Lightning invoice and its polling running: the
  // member may already be paying from their phone, and Coinos can't cancel
  // the invoice anyway. If it gets paid, the order completes and the kiosk
  // moves to "done" from whichever screen it's on.
  const cancelPayment = useCallback(() => {
    const told = cashToldRef.current
    if (told && told === cashOpenRef.current && cartRef.current) notifyCashDesk(cartRef.current.id, told, true)
    cashOpenRef.current = null
    cashToldRef.current = null
    setState((s) => ({ ...s, error: null, screen: "payment-method", cashDeadline: null }))
  }, [])

  const reset = useCallback(() => {
    epochRef.current += 1
    // Every new visit starts in Spanish.
    setLang("es")
    cashOpenRef.current = null
    cashToldRef.current = null
    queueRef.current = Promise.resolve()
    pendingRef.current = {}
    syncQueuedRef.current = false
    stopPolling()
    pollBusyRef.current = false
    cartRef.current = null
    invoiceRef.current = null
    setState((s) => ({
      ...s,
      screen: "idle",
      cart: null,
      pending: {},
      order: null,
      invoice: null,
      invoiceProgress: null,
      paymentStatus: null,
      paymentMethod: null,
      savingFor: null,
      cashDeadline: null,
      error: null,
    }))
    loadCatalog()
  }, [loadCatalog, stopPolling])

  // Five minutes on the cash screen with no tap: place the order, have the
  // backend record its cash payment as captured (which fulfils it), and go
  // back to the start screen for the next member. If the capture fails the
  // order stays unpaid, and the backend's unpaid-cash Slack alert follows it up.
  const autoPayCash = useCallback(async () => {
    const cart = cartRef.current
    if (!cart || confirmingRef.current) return
    confirmingRef.current = true
    const epoch = epochRef.current
    try {
      const ready = await manualPrepRef.current
      if (epoch !== epochRef.current || !ready) return
      cashOpenRef.current = null
      await sdk.store.payment.initiatePaymentSession(cartRef.current ?? ready, { provider_id: CASH_PAYMENT_PROVIDER_ID })
      const result = await sdk.store.cart.complete(cart.id)
      if (result.type === "order") {
        await sdk.client.fetch(`/store/cash-orders/${result.order.id}/auto-capture`, { method: "POST" })
      }
    } catch {
      // Nobody is at the kiosk to tell; start over for the next member.
    } finally {
      confirmingRef.current = false
    }
    if (epoch === epochRef.current) reset()
  }, [reset])

  useEffect(() => {
    if (state.screen !== "payment" || state.paymentMethod !== "cash" || !state.cashDeadline) return
    const timer = setTimeout(autoPayCash, Math.max(0, state.cashDeadline - Date.now()))
    return () => clearTimeout(timer)
  }, [state.screen, state.paymentMethod, state.cashDeadline, autoPayCash])

  return {
    ...state,
    setItemQuantity,
    goToPaymentMethod,
    goTo,
    startPayment,
    startArkPayment,
    startBip321Payment,
    startBankQrPayment,
    confirmBankQrPaid,
    startCashPayment,
    confirmCashOrder,
    retryPayment,
    cancelPayment,
    reset,
  }
}

type CartChange = { variantId: string; lineItemId: string | null; quantity: number }

// The first tapped-in quantity that differs from the cart, or null once the
// cart matches everything the member has tapped.
export function nextCartChange(
  cart: HttpTypes.StoreCart | null,
  pending: Record<string, number>
): CartChange | null {
  for (const [variantId, quantity] of Object.entries(pending)) {
    const line = cart?.items?.find((i) => i.variant_id === variantId)
    if ((line?.quantity ?? 0) !== quantity) {
      return { variantId, lineItemId: line?.id ?? null, quantity }
    }
  }
  return null
}

// Tells the front desk (staff Slack channel, via the backend) how much cash to
// collect for this cart, or, with cancelled, not to. Best effort: a failure
// changes nothing at the kiosk.
function notifyCashDesk(cartId: string, attempt: string, cancelled: boolean) {
  sdk.client
    .fetch(`/store/cash-collect/${cartId}`, { method: "POST", body: { attempt, cancelled } })
    .catch(() => {})
}
