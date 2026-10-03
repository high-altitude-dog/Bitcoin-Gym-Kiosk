import { useCallback, useEffect, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "../lib/medusa"

export type Screen = "grid" | "cart" | "payment" | "done"

const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*images"

interface KioskState {
  screen: Screen
  region: HttpTypes.StoreRegion | null
  products: HttpTypes.StoreProduct[]
  cart: HttpTypes.StoreCart | null
  order: HttpTypes.StoreOrder | null
  loading: boolean
  error: string | null
}

export function useKiosk() {
  const [state, setState] = useState<KioskState>({
    screen: "grid",
    region: null,
    products: [],
    cart: null,
    order: null,
    loading: true,
    error: null,
  })

  const loadCatalog = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { regions } = await sdk.store.region.list()
      const region = regions[0] ?? null
      const { products } = await sdk.store.product.list({
        region_id: region?.id,
        fields: PRODUCT_FIELDS,
      })
      setState((s) => ({ ...s, region, products, loading: false }))
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

  const startPayment = useCallback(async () => {
    if (!state.cart) return
    let cart = state.cart
    if (!cart.shipping_methods?.length) {
      const { shipping_options } = await sdk.store.fulfillment.listCartOptions({
        cart_id: cart.id,
      })
      const pickup = shipping_options[0]
      if (pickup) {
        const { cart: updated } = await sdk.store.cart.addShippingMethod(cart.id, {
          option_id: pickup.id,
        })
        cart = updated
      }
    }
    setState((s) => ({ ...s, cart, screen: "payment" }))
  }, [state.cart])

  // Payment is mocked for now: authorize with the system provider and
  // complete the order immediately. The real Coinos flow replaces this once
  // it is wired up in the kiosk.
  const confirmMockPayment = useCallback(async () => {
    if (!state.cart) return
    await sdk.store.payment.initiatePaymentSession(state.cart, {
      provider_id: "pp_system_default",
    })
    const result = await sdk.store.cart.complete(state.cart.id)
    if (result.type === "order") {
      setState((s) => ({ ...s, order: result.order, screen: "done" }))
    } else {
      setState((s) => ({
        ...s,
        error: "Payment could not be completed. Please try again.",
        screen: "cart",
      }))
    }
  }, [state.cart])

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      screen: "grid",
      cart: null,
      order: null,
      error: null,
    }))
    loadCatalog()
  }, [loadCatalog])

  return {
    ...state,
    addItem,
    setQuantity,
    goTo,
    startPayment,
    confirmMockPayment,
    reset,
  }
}
