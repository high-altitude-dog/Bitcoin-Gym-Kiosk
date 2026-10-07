import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "../lib/medusa"
import { t } from "../lib/strings"
import {
  COINOS_LIGHTNING_PROVIDER_ID,
  MANUAL_PAYMENT_PROVIDER_ID,
  readLightningInvoice,
  type LightningInvoice,
} from "../lib/payment"

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
// Byte's magic hoops stay on screen at least this long before the QR, so a
// fast invoice doesn't make him flash on and off.
const MIN_BYTE_MS = 1500
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
  // Quantities tapped in but not yet confirmed by Medusa, by variant id.
  // The screen shows these at once; syncCart() sends them in the background.
  pending: Record<string, number>
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
    pending: {},
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
  const pendingRef = useRef<Record<string, number>>({})
  const syncQueuedRef = useRef(false)
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

  // Sends the tapped-in quantities to Medusa one change at a time, until the
  // cart matches what the member sees. Taps that land while a request is in
  // flight are picked up by the same loop, so a burst of taps costs one
  // request per product, not one per tap. Each change takes about a second
  // on the server, which is why the screen doesn't wait for it.
  const syncCart = useCallback(
    async (isCurrent: () => boolean) => {
      syncQueuedRef.current = false
      try {
        for (;;) {
          if (!isCurrent()) return
          const cart = cartRef.current
          const change = nextCartChange(cart, pendingRef.current)
          if (!change) {
            pendingRef.current = {}
            setState((s) => ({ ...s, pending: {} }))
            return
          }
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
        }
      } catch (err) {
        // Drop the unsent taps; enqueue() then reloads the cart so the
        // screen shows what it really holds.
        if (isCurrent()) {
          pendingRef.current = {}
          setState((s) => ({ ...s, pending: {} }))
        }
        throw err
      }
    },
    [commitCart]
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

  // "Pagar" waits for the cart to settle, so the payment-method screen shows
  // the total Medusa will actually charge.
  const goToPaymentMethod = useCallback(async () => {
    const epoch = epochRef.current
    await settleCart()
    if (epoch !== epochRef.current || !cartRef.current?.items?.length) return
    setState((s) => ({ ...s, error: null, screen: "payment-method" }))
  }, [settleCart])

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
    async (cart: HttpTypes.StoreCart, byteSince = Date.now()) => {
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
        const wait = MIN_BYTE_MS - (Date.now() - byteSince)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        if (epoch !== epochRef.current) return

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
    await settleCart()
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

    // Byte from the tap onwards: the shipping step, the rate check and the
    // invoice all happen behind him.
    const byteSince = Date.now()
    setState((s) => ({
      ...s,
      error: null,
      invoice: null,
      paymentStatus: null,
      paymentMethod: "lightning",
      screen: "payment",
    }))
    try {
      const withShipping = await ensureShippingMethod(cart)
      await initiateLightningPayment(withShipping, byteSince)
    } catch {
      setState((s) => ({ ...s, error: t.errorInvoiceFailed, screen: "payment-method" }))
    }
  }, [ensureShippingMethod, initiateLightningPayment, settleCart])

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
    await settleCart()
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
  }, [ensureShippingMethod, commitCart, settleCart])

  // Stand-in for the Baneco webhook: the "Pagado" button records the bank QR
  // payment with Medusa's manual provider and completes the order. Nothing
  // checks that the money arrived, so staff must confirm it in the bank app
  // (the Slack sale alert is the prompt). Replace with the real Baneco
  // confirmation when the API is available.
  const confirmBankQrPaid = useCallback(async () => {
    const cart = cartRef.current
    if (!cart) return
    const epoch = epochRef.current
    try {
      await sdk.store.payment.initiatePaymentSession(cart, { provider_id: MANUAL_PAYMENT_PROVIDER_ID })
      const result = await sdk.store.cart.complete(cart.id)
      if (epoch !== epochRef.current) return
      if (result.type !== "order") throw new Error("cart did not complete")
      // Any Lightning invoice from earlier in this visit no longer has a
      // session behind it, so stop watching it.
      stopPolling()
      invoiceRef.current = null
      setState((s) => ({ ...s, order: result.order, invoice: null, paymentStatus: null, error: null, screen: "done" }))
    } catch {
      if (epoch !== epochRef.current) return
      setState((s) => ({ ...s, error: t.errorBankQrConfirm }))
    }
  }, [stopPolling])

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
      paymentStatus: null,
      paymentMethod: null,
      error: null,
    }))
    loadCatalog()
  }, [loadCatalog, stopPolling])

  return {
    ...state,
    setItemQuantity,
    goToPaymentMethod,
    goTo,
    startPayment,
    startBankQrPayment,
    confirmBankQrPaid,
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
