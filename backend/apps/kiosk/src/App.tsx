import { useEffect, useRef } from "react"
import "./App.css"
import "./kiosk.css"
import { t } from "./lib/strings"
import { useKiosk } from "./state/useKiosk"
import { useIdleReset } from "./hooks/useIdleReset"
import { useOnlineStatus } from "./hooks/useOnlineStatus"
import { useTapFeedback } from "./hooks/useTapFeedback"
import { IdleScreen } from "./screens/IdleScreen"
import { ShopScreen } from "./screens/ShopScreen"
import { Stage } from "./screens/Stage"
import { PaymentMethodScreen } from "./screens/PaymentMethodScreen"
import { PaymentScreen } from "./screens/PaymentScreen"
import { DoneScreen } from "./screens/DoneScreen"

function App() {
  const kiosk = useKiosk()
  const isOnline = useOnlineStatus()
  useTapFeedback()
  // Never reset while a Lightning invoice is live (the member may be paying
  // from their phone) or while a paid order is waiting on staff.
  useIdleReset(
    kiosk.reset,
    kiosk.screen !== "idle" &&
      kiosk.paymentStatus !== "awaiting" &&
      kiosk.paymentStatus !== "needs_staff"
  )

  // The only place a lost connection can leave the kiosk stuck is the very
  // first catalog load (screen stays "idle" with no cart yet, so there's
  // nothing to lose by retrying automatically once wifi comes back). Only on
  // the offline-to-online transition: retrying on every failure would hammer
  // a backend that's down while the wifi is up.
  const wasOnline = useRef(isOnline)
  useEffect(() => {
    const cameBackOnline = isOnline && !wasOnline.current
    wasOnline.current = isOnline
    if (cameBackOnline && kiosk.error && kiosk.screen === "idle") {
      kiosk.reset()
    }
  }, [isOnline, kiosk.error, kiosk.screen, kiosk.reset])

  return (
    <>
      {!isOnline && <div className="reconnecting-banner">{t.reconnecting}</div>}
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

  // Full-screen only for a failed catalog load. Its Retry clears the cart,
  // so it must never stand in for a payment error on a live cart.
  if (kiosk.error && kiosk.screen === "idle") {
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
        error={kiosk.error}
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
        error={kiosk.error}
        onBankQrPaid={kiosk.confirmBankQrPaid}
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
          pending={kiosk.pending}
          onSetQuantity={kiosk.setItemQuantity}
          onPay={kiosk.goToPaymentMethod}
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
