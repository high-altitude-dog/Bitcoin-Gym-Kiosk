import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "../lib/medusa"
import { t } from "../lib/strings"
import { COINOS_LIGHTNING_PROVIDER_ID, readLightningInvoice, type LightningInvoice } from "../lib/payment"

export type Screen = "idle" | "shop" | "payment-method" | "payment" | "done"
// "needs_staff": the payment was confirmed but the order could not be
// completed. The member has paid, so the kiosk must not offer to pay again
// or reset itself until staff step in.
export type PaymentStatus = "awaiting" | "expired" | "needs_staff" | null
// "bank_qr" is a placeholder while the Baneco API request is pending: it
// shows a static QR square instead of a real invoice. Swap in the real
// Baneco flow here once credentials arrive.
export type PaymentMethod = "lightning" | "bank_qr" | null

const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*images,+categories.id,+categories.name"
const POLL_INTERVAL_MS = 500
// Keep checking this long past the invoice's deadline before calling it
// expired: a payment sent in the last seconds can settle, and the Coinos
// webhook arrive, a little after the deadline.
const EXPIRY_GRACE_MS = 60_000
const PAYMENT_SESSION_FIELDS =
  "+payment_collection.payment_sessions.status,+payment_collection.payment_sessions.provider_id"

interface KioskState {
  screen: Screen
  region: HttpTypes.StoreRegion | null
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
  order: HttpTypes.StoreOrder | null
  invoice: LightningInvoice | null
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  loading: boolean
  error: string | null
}

export function useKiosk() {
  const [state, setState] = useState<KioskState>({
    screen: "idle",
    region: null,
    products: [],
    categories: [],
    cart: null,
    order: null,
    invoice: null,
    paymentStatus: null,
    paymentMethod: null,
    loading: true,
    error: null,
  })

  // The async flows below read these refs rather than `state`, so a tap or
  // a poll tick never acts on a cart/invoice from a render that's out of date.
  const cartRef = useRef<HttpTypes.StoreCart | null>(null)
  const regionRef = useRef<HttpTypes.StoreRegion | null>(null)
  const invoiceRef = useRef<LightningInvoice | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  // Bumped by reset(): work started for the previous member checks it and
  // drops its result instead of writing into the next member's session.
  const epochRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollBusyRef = useRef(false)

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
      const [{ products }, { product_categories }] = await Promise.all([
        sdk.store.product.list({
          region_id: region?.id,
          fields: PRODUCT_FIELDS,
        }),
        sdk.store.category.list({
          fields: "id,name,rank,parent_category_id",
          limit: 50,
        }),
      ])
      const categories = product_categories
        .filter((c) => !c.parent_category_id)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      setState((s) => ({ ...s, region, products, categories, loading: false }))
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

  const addItem = useCallback(
    (variantId: string) =>
      enqueue(async (isCurrent) => {
        let cart = cartRef.current
        if (!cart) {
          const created = await sdk.store.cart.create({ region_id: regionRef.current?.id })
          if (!isCurrent()) return
          cart = created.cart
          commitCart(cart)
        }
        const { cart: updated } = await sdk.store.cart.createLineItem(cart.id, {
          variant_id: variantId,
          quantity: 1,
        })
        if (isCurrent()) commitCart(updated)
      }),
    [enqueue, commitCart]
  )

  const setQuantity = useCallback(
    (lineItemId: string, quantity: number) =>
      enqueue(async (isCurrent) => {
        const cart = cartRef.current
        if (!cart) return
        if (quantity <= 0) {
          const { parent } = await sdk.store.cart.deleteLineItem(cart.id, lineItemId)
          if (isCurrent() && parent) commitCart(parent)
          return
        }
        const { cart: updated } = await sdk.store.cart.updateLineItem(cart.id, lineItemId, {
          quantity,
        })
        if (isCurrent()) commitCart(updated)
      }),
    [enqueue, commitCart]
  )

  const goTo = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }))
  }, [])

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
          const session = cart.payment_collection?.payment_sessions?.find(
            (s) => s.provider_id === COINOS_LIGHTNING_PROVIDER_ID
          )
          if (session?.status === "authorized") {
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
                paymentMethod: "lightning",
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
    async (cart: HttpTypes.StoreCart) => {
      const epoch = epochRef.current
      stopPolling()
      invoiceRef.current = null
      setState((s) => ({
        ...s,
        error: null,
        invoice: null,
        paymentStatus: null,
        paymentMethod: "lightning",
        screen: "payment",
      }))

      try {
        const { available } = await sdk.client.fetch<{ available: boolean }>(
          "/store/lightning-availability"
        )
        if (epoch !== epochRef.current) return
        if (!available) {
          setState((s) => ({ ...s, error: t.errorLightningUnavailable, screen: "payment-method" }))
          return
        }

        const { payment_collection } = await sdk.store.payment.initiatePaymentSession(
          cart,
          { provider_id: COINOS_LIGHTNING_PROVIDER_ID },
          { fields: "+payment_sessions.data,+payment_sessions.provider_id" }
        )
        if (epoch !== epochRef.current) return
        const session = payment_collection.payment_sessions?.find(
          (s) => s.provider_id === COINOS_LIGHTNING_PROVIDER_ID
        )
        const invoice = readLightningInvoice(session?.data, Date.now())
        if (!invoice) {
          throw new Error("coinos-lightning did not return invoice data")
        }

        invoiceRef.current = invoice
        cartRef.current = cart
        setState((s) => ({ ...s, cart, invoice, paymentStatus: "awaiting" }))
        pollForPayment(cart.id)
      } catch {
        if (epoch !== epochRef.current) return
        setState((s) => ({ ...s, error: t.errorInvoiceFailed, screen: "payment-method" }))
      }
    },
    [pollForPayment, stopPolling]
  )

  const startPayment = useCallback(async () => {
    // Let any taps still in flight land first, so the invoice is for the
    // cart the member actually sees.
    await queueRef.current
    const cart = cartRef.current
    if (!cart) return

    // Coinos can't cancel an invoice, so one replaced by a new invoice stays
    // payable with no order behind it. If the member comes back to Lightning
    // with the same total while their invoice is still live, show that one
    // again instead of creating another.
    const live = invoiceRef.current
    if (live && Date.now() < live.expiresAt && live.bobAmount === Number(cart.total)) {
      setState((s) => ({ ...s, error: null, paymentMethod: "lightning", screen: "payment" }))
      return
    }

    try {
      const withShipping = await ensureShippingMethod(cart)
      await initiateLightningPayment(withShipping)
    } catch {
      setState((s) => ({ ...s, error: t.errorInvoiceFailed, screen: "payment-method" }))
    }
  }, [ensureShippingMethod, initiateLightningPayment])

  const retryPayment = useCallback(async () => {
    const cart = cartRef.current
    if (!cart) return
    await initiateLightningPayment(cart)
  }, [initiateLightningPayment])

  // Baneco access is still pending (see CLAUDE.md), so this just shows a
  // static placeholder QR rather than creating a real invoice. It leaves any
  // live Lightning invoice and its polling alone: if the member already paid
  // that invoice, the order still completes.
  const startBankQrPayment = useCallback(async () => {
    await queueRef.current
    const cart = cartRef.current
    if (!cart) return
    const epoch = epochRef.current
    try {
      const withShipping = await ensureShippingMethod(cart)
      if (epoch !== epochRef.current) return
      commitCart(withShipping)
      setState((s) => ({ ...s, error: null, paymentMethod: "bank_qr", screen: "payment" }))
    } catch {
      if (epoch !== epochRef.current) return
      setState((s) => ({ ...s, error: t.errorPayment, screen: "payment-method" }))
    }
  }, [ensureShippingMethod, commitCart])

  // Deliberately keeps a live Lightning invoice and its polling running: the
  // member may already be paying from their phone, and Coinos can't cancel
  // the invoice anyway. If it gets paid, the order completes and the kiosk
  // moves to "done" from whichever screen it's on.
  const cancelPayment = useCallback(() => {
    setState((s) => ({ ...s, error: null, screen: "payment-method" }))
  }, [])

  const reset = useCallback(() => {
    epochRef.current += 1
    queueRef.current = Promise.resolve()
    stopPolling()
    pollBusyRef.current = false
    cartRef.current = null
    invoiceRef.current = null
    setState((s) => ({
      ...s,
      screen: "idle",
      cart: null,
      order: null,
      invoice: null,
      paymentStatus: null,
      paymentMethod: null,
      error: null,
    }))
    loadCatalog()
  }, [loadCatalog, stopPolling])

  return {
    ...state,
    addItem,
    setQuantity,
    goTo,
    startPayment,
    startBankQrPayment,
    retryPayment,
    cancelPayment,
    reset,
  }
}
