import { useEffect, useRef, type ReactNode } from "react"
import "./App.css"
import "./kiosk.css"
import { toKioskCart, toKioskProduct } from "./lib/kioskMapping"
import { t, useLang } from "./lib/strings"
import { useKiosk } from "./state/useKiosk"
import { useIdleReset } from "./hooks/useIdleReset"
import { useOnlineStatus } from "./hooks/useOnlineStatus"
import { useTapFeedback } from "./hooks/useTapFeedback"
import { IdleScreen } from "./screens/IdleScreen"
import { ConnectScreen } from "./screens/ConnectScreen"
import { ShopScreen } from "./screens/ShopScreen"
import { Stage } from "./screens/Stage"
import { PaymentMethodScreen } from "./screens/PaymentMethodScreen"
import { PaymentScreen } from "./screens/PaymentScreen"
import { DoneScreen } from "./screens/DoneScreen"
import { ConnectionErrorScreen } from "./screens/ConnectionErrorScreen"

function App() {
  const kiosk = useKiosk()
  // Re-render everything when the language flags are tapped.
  useLang()
  const isOnline = useOnlineStatus()
  useTapFeedback()
  // Never reset while a Lightning invoice is live (the member may be paying
  // from their phone) or while a paid order is waiting on staff.
  useIdleReset(
    kiosk.reset,
    kiosk.screen !== "idle" &&
      kiosk.paymentStatus !== "awaiting" &&
      kiosk.paymentStatus !== "confirmed" &&
      // The cash screen has its own 5-minute countdown.
      !(kiosk.screen === "payment" && kiosk.paymentMethod === "cash") &&
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

  // Whether the connection-error screen was up before this try started: the
  // same screen stays on while it retries (see ConnectionErrorScreen), so the
  // member sees one steady screen, not "Cargando..." flashing every 15 s.
  const showingError = !!kiosk.error && kiosk.screen === "idle"
  const hadError = useRef(false)
  const retrying = kiosk.loading && hadError.current
  useEffect(() => {
    if (showingError) hadError.current = true
    else if (!kiosk.loading) hadError.current = false
  }, [showingError, kiosk.loading])

  return (
    <>
      {!isOnline && <div className="reconnecting-banner">{t.reconnecting}</div>}
      {renderScreen(kiosk, retrying)}
    </>
  )
}

function renderScreen(kiosk: ReturnType<typeof useKiosk>, retrying: boolean) {
  if (retrying) {
    return plain(<ConnectionErrorScreen message={t.errorCatalog} retrying onRetry={kiosk.reset} />)
  }

  if (kiosk.loading) {
    return plain(
      <div className="screen screen--center">
        <p>{t.loading}</p>
      </div>
    )
  }

  // Full-screen only for a failed catalog load. Its Retry clears the cart,
  // so it must never stand in for a payment error on a live cart.
  if (kiosk.error && kiosk.screen === "idle") {
    return plain(<ConnectionErrorScreen message={kiosk.error} retrying={false} onRetry={kiosk.reset} />)
  }

  if (kiosk.screen === "connect") {
    return plain(<ConnectScreen onBack={() => kiosk.goTo("idle")} />)
  }

  // No cart needed yet: "Pagar" can come before Medusa has created it.
  if (kiosk.screen === "payment-method") {
    return plain(
      <PaymentMethodScreen
        total={shownTotal(kiosk)}
        savingFor={kiosk.savingFor}
        error={kiosk.error}
        onLightning={() => kiosk.startPayment()}
        onBankQr={kiosk.startBankQrPayment}
        onCash={kiosk.startCashPayment}
        onArk={kiosk.arkEnabled ? kiosk.startArkPayment : null}
        onBack={() => kiosk.goTo("shop")}
      />
    )
  }

  if (kiosk.screen === "payment" && kiosk.cart) {
    return plain(
      <PaymentScreen
        cart={kiosk.cart}
        paymentMethod={kiosk.paymentMethod}
        invoice={kiosk.invoice}
        paymentStatus={kiosk.paymentStatus}
        error={kiosk.error}
        onBankQrPaid={kiosk.confirmBankQrPaid}
        onCashConfirm={kiosk.confirmCashOrder}
        cashDeadline={kiosk.cashDeadline}
        onRetry={kiosk.retryPayment}
        onCancel={kiosk.cancelPayment}
      />
    )
  }

  // A confirmed Lightning payment shows the done screen before its order exists.
  if (kiosk.screen === "done" && (kiosk.order || kiosk.paymentStatus === "confirmed")) {
    return plain(
      <DoneScreen order={kiosk.order} payAtDesk={kiosk.paymentMethod === "cash"} onNewOrder={kiosk.reset} />
    )
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
          onExit={kiosk.reset}
        />
      </Stage>
    )
  }

  return (
    <Stage variant="idle">
      <IdleScreen onStart={() => kiosk.goTo("shop")} onConnect={() => kiosk.goTo("connect")} />
    </Stage>
  )
}

export default App

// Everything but idle and shop sits on the same 1200x1920 stage, without a
// wall, so it scales with the screen exactly like the shop.
function plain(screen: ReactNode) {
  return <Stage variant="plain">{screen}</Stage>
}

// The order bar's total: the cart plus taps not yet saved.
function shownTotal(kiosk: ReturnType<typeof useKiosk>): number {
  const products = kiosk.products.map(toKioskProduct).filter((p) => p !== null)
  return toKioskCart(kiosk.cart, kiosk.pending, products).total
}
