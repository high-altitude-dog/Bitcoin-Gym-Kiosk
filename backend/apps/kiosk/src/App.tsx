import { useEffect } from "react"
import "./App.css"
import "./kiosk.css"
import { t } from "./lib/strings"
import { useKiosk } from "./state/useKiosk"
import { useIdleReset } from "./hooks/useIdleReset"
import { useOnlineStatus } from "./hooks/useOnlineStatus"
import { IdleScreen } from "./screens/IdleScreen"
import { ShopScreen } from "./screens/ShopScreen"
import { Stage } from "./screens/Stage"
import { PaymentMethodScreen } from "./screens/PaymentMethodScreen"
import { PaymentScreen } from "./screens/PaymentScreen"
import { DoneScreen } from "./screens/DoneScreen"

function App() {
  const kiosk = useKiosk()
  const isOnline = useOnlineStatus()
  useIdleReset(kiosk.reset, kiosk.screen !== "idle" && kiosk.paymentStatus !== "awaiting")

  // The only place a lost connection can leave the kiosk stuck is the very
  // first catalog load (screen stays "idle" with no cart yet, so there's
  // nothing to lose by retrying automatically once wifi comes back).
  useEffect(() => {
    if (isOnline && kiosk.error && kiosk.screen === "idle") {
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
        <p>{t.loading}</p>
      </div>
    )
  }

  if (kiosk.error && (kiosk.screen === "idle" || kiosk.screen === "shop")) {
    return (
      <div className="screen screen--center">
        <p>{kiosk.error}</p>
        <button className="primary-button" onClick={kiosk.reset}>
          {t.retry}
        </button>
      </div>
    )
  }

  if (kiosk.screen === "payment-method" && kiosk.cart) {
    return (
      <PaymentMethodScreen
        cart={kiosk.cart}
        onLightning={kiosk.startPayment}
        onBankQr={kiosk.startBankQrPayment}
        onBack={() => kiosk.goTo("shop")}
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

  if (kiosk.screen === "shop") {
    return (
      <Stage variant="shop">
        <ShopScreen
          products={kiosk.products}
          categories={kiosk.categories}
          cart={kiosk.cart}
          onAdd={kiosk.addItem}
          onSetQuantity={kiosk.setQuantity}
          onPay={() => kiosk.goTo("payment-method")}
        />
      </Stage>
    )
  }

  return (
    <Stage variant="idle">
      <IdleScreen onStart={() => kiosk.goTo("shop")} />
    </Stage>
  )
}

export default App
