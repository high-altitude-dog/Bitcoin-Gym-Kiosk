import { useCallback, useEffect, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "../lib/medusa"
import { COINOS_LIGHTNING_PROVIDER_ID, readLightningInvoice, type LightningInvoice } from "../lib/payment"

export type Screen = "idle" | "shop" | "payment-method" | "payment" | "done"
export type PaymentStatus = "awaiting" | "expired" | null
// "bank_qr" is a placeholder while the Baneco API request is pending: it
// shows a static QR square instead of a real invoice. Swap in the real
// Baneco flow here once credentials arrive.
export type PaymentMethod = "lightning" | "bank_qr" | null

const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*images,+categories.id,+categories.name"
const POLL_INTERVAL_MS = 3_000
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        error: "Could not reach the store. Check the connection and try again.",
      }))
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const ensureCart = useCallback(async (): Promise<HttpTypes.StoreCart> => {
    if (state.cart) return state.cart
    const { cart } = await sdk.store.cart.create({ region_id: state.region?.id })
    setState((s) => ({ ...s, cart }))
    return cart
  }, [state.cart, state.region])

  const addItem = useCallback(
    async (variantId: string) => {
      const cart = await ensureCart()
      const { cart: updated } = await sdk.store.cart.createLineItem(cart.id, {
        variant_id: variantId,
        quantity: 1,
      })
      setState((s) => ({ ...s, cart: updated }))
    },
    [ensureCart]
  )

  const setQuantity = useCallback(
    async (lineItemId: string, quantity: number) => {
      if (!state.cart) return
      if (quantity <= 0) {
        const { parent: updated } = await sdk.store.cart.deleteLineItem(
          state.cart.id,
          lineItemId
        )
        setState((s) => ({ ...s, cart: updated ?? s.cart }))
        return
      }
      const { cart: updated } = await sdk.store.cart.updateLineItem(
        state.cart.id,
        lineItemId,
        { quantity }
      )
      setState((s) => ({ ...s, cart: updated }))
    },
    [state.cart]
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
  const pollForPayment = useCallback((cartId: string, expiresAt: number) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      if (Date.now() >= expiresAt) {
        stopPolling()
        setState((s) => ({ ...s, paymentStatus: "expired" }))
        return
      }

      try {
        const { cart } = await sdk.store.cart.retrieve(cartId, {
          fields: PAYMENT_SESSION_FIELDS,
        })
        const session = cart.payment_collection?.payment_sessions?.find(
          (s) => s.provider_id === COINOS_LIGHTNING_PROVIDER_ID
        )
        if (session?.status !== "authorized") return

        stopPolling()
        const result = await sdk.store.cart.complete(cartId)
        if (result.type === "order") {
          setState((s) => ({ ...s, order: result.order, screen: "done", paymentStatus: null }))
        } else {
          setState((s) => ({
            ...s,
            error: "Payment was confirmed but the order could not be completed. Please tell a staff member.",
            screen: "shop",
            paymentStatus: null,
          }))
        }
      } catch {
        // A transient network error; the next tick tries again rather than
        // tearing down the invoice the member might already be paying.
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

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

  // Takes the cart as an argument rather than reading state.cart, so a
  // caller that just attached a shipping method (startPayment) or is
  // retrying (retryPayment) always uses the cart it has in hand instead of
  // a possibly one-render-stale value from the hook's closure.
  const initiateLightningPayment = useCallback(
    async (cart: HttpTypes.StoreCart) => {
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
        if (!available) {
          setState((s) => ({
            ...s,
            error: "Lightning payment is temporarily unavailable. Please try again shortly.",
            screen: "payment-method",
          }))
          return
        }

        const { payment_collection } = await sdk.store.payment.initiatePaymentSession(
          cart,
          { provider_id: COINOS_LIGHTNING_PROVIDER_ID },
          { fields: "+payment_sessions.data,+payment_sessions.provider_id" }
        )
        const session = payment_collection.payment_sessions?.find(
          (s) => s.provider_id === COINOS_LIGHTNING_PROVIDER_ID
        )
        const invoice = readLightningInvoice(session?.data)
        if (!invoice) {
          throw new Error("coinos-lightning did not return invoice data")
        }

        setState((s) => ({ ...s, cart, invoice, paymentStatus: "awaiting" }))
        pollForPayment(cart.id, invoice.expiresAt)
      } catch {
        setState((s) => ({
          ...s,
          error: "Could not create the Lightning invoice. Please try again.",
          screen: "payment-method",
        }))
      }
    },
    [pollForPayment]
  )

  const startPayment = useCallback(async () => {
    if (!state.cart) return
    const cart = await ensureShippingMethod(state.cart)
    await initiateLightningPayment(cart)
  }, [state.cart, ensureShippingMethod, initiateLightningPayment])

  const retryPayment = useCallback(() => {
    if (!state.cart) return
    initiateLightningPayment(state.cart)
  }, [state.cart, initiateLightningPayment])

  // Baneco access is still pending (see CLAUDE.md), so this just shows a
  // static placeholder QR rather than creating a real invoice. No polling:
  // there is nothing yet to confirm.
  const startBankQrPayment = useCallback(async () => {
    if (!state.cart) return
    const cart = await ensureShippingMethod(state.cart)
    setState((s) => ({
      ...s,
      cart,
      error: null,
      invoice: null,
      paymentStatus: null,
      paymentMethod: "bank_qr",
      screen: "payment",
    }))
  }, [state.cart, ensureShippingMethod])

  const cancelPayment = useCallback(() => {
    stopPolling()
    setState((s) => ({ ...s, screen: "payment-method", invoice: null, paymentStatus: null, paymentMethod: null }))
  }, [stopPolling])

  const reset = useCallback(() => {
    stopPolling()
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
