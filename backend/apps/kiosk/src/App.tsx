import { useEffect } from "react"
import "./App.css"
import { useKiosk } from "./state/useKiosk"
import { useIdleReset } from "./hooks/useIdleReset"
import { useOnlineStatus } from "./hooks/useOnlineStatus"
import { ProductGrid } from "./screens/ProductGrid"
import { CartScreen } from "./screens/CartScreen"
import { PaymentScreen } from "./screens/PaymentScreen"
import { DoneScreen } from "./screens/DoneScreen"

function App() {
  const kiosk = useKiosk()
  const isOnline = useOnlineStatus()
  useIdleReset(kiosk.reset, kiosk.paymentStatus !== "awaiting")

  // The only place a lost connection can leave the kiosk stuck is the very
  // first catalog load (screen stays "grid" with no cart yet, so there's
  // nothing to lose by retrying automatically once wifi comes back).
  useEffect(() => {
    if (isOnline && kiosk.error && kiosk.screen === "grid") {
      kiosk.reset()
    }
  }, [isOnline, kiosk.error, kiosk.screen, kiosk.reset])

  return (
    <>
      {!isOnline && <div className="reconnecting-banner">Reconnecting...</div>}
      {renderScreen(kiosk)}
    </>
  )
}

function renderScreen(kiosk: ReturnType<typeof useKiosk>) {
  if (kiosk.loading) {
    return (
      <div className="screen screen--center">
        <p>Loading...</p>
      </div>
    )
  }

  if (kiosk.error && kiosk.screen === "grid") {
    return (
      <div className="screen screen--center">
        <p>{kiosk.error}</p>
        <button className="primary-button" onClick={kiosk.reset}>
          Retry
        </button>
      </div>
    )
  }

  if (kiosk.screen === "cart" && kiosk.cart) {
    return (
      <CartScreen
        cart={kiosk.cart}
        error={kiosk.error}
        onQuantityChange={kiosk.setQuantity}
        onBack={() => kiosk.goTo("grid")}
        onPayWithLightning={kiosk.startPayment}
        onPayWithBankQr={kiosk.startBankQrPayment}
      />
    )
  }

  if (kiosk.screen === "payment" && kiosk.cart) {
    return (
      <PaymentScreen
        cart={kiosk.cart}
        paymentMethod={kiosk.paymentMethod}
        invoice={kiosk.invoice}
        paymentStatus={kiosk.paymentStatus}
        onRetry={kiosk.retryPayment}
        onCancel={kiosk.cancelPayment}
      />
    )
  }

  if (kiosk.screen === "done" && kiosk.order) {
    return <DoneScreen order={kiosk.order} onNewOrder={kiosk.reset} />
  }

  const cartItemCount =
    kiosk.cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0

  return (
    <ProductGrid
      products={kiosk.products}
      cartItemCount={cartItemCount}
      onAdd={kiosk.addItem}
      onViewCart={() => kiosk.goTo("cart")}
    />
  )
}

export default App
