import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"
import { useCountdown, formatCountdown } from "../hooks/useCountdown"
import type { LightningInvoice } from "../lib/payment"
import { KIOSK } from "../lib/stageConfig"
import { ByteLoader } from "./ByteLoader"
import { BANK_QR_OPTIONS, BANK_QR_PAYLOAD } from "../lib/bankQr"
import type { PaymentMethod, PaymentStatus } from "../state/useKiosk"

interface Props {
  cart: HttpTypes.StoreCart
  paymentMethod: PaymentMethod
  invoice: LightningInvoice | null
  paymentStatus: PaymentStatus
  error: string | null
  onBankQrPaid: () => Promise<void>
  onCashConfirm: () => Promise<void>
  // Cash: when the order is recorded as paid if nobody taps.
  cashDeadline: number | null
  onRetry: () => void
  onCancel: () => void
}

function usePaymentQrCode(text: string | undefined) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!text) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(text, { width: 720, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [text])

  return qrDataUrl
}

// The static bank QR, drawn once when the app loads (not when its screen
// opens), the same size and quiet zone as the Lightning QR.
const bankQrImage: Promise<string | null> = QRCode.toDataURL(
  [{ data: new TextEncoder().encode(BANK_QR_PAYLOAD), mode: "byte" as const }],
  { ...BANK_QR_OPTIONS, width: 720, margin: 1 }
).catch(() => null)
let bankQrUrlReady: string | null = null
void bankQrImage.then((u) => (bankQrUrlReady = u))

function useBankQrCode(enabled: boolean) {
  const [url, setUrl] = useState<string | null>(bankQrUrlReady)
  useEffect(() => {
    if (!enabled || url) return
    let cancelled = false
    void bankQrImage.then((u) => !cancelled && setUrl(u))
    return () => {
      cancelled = true
    }
  }, [enabled, url])
  return url
}

export function PaymentScreen({
  cart,
  paymentMethod,
  invoice,
  paymentStatus,
  error,
  onBankQrPaid,
  onCashConfirm,
  cashDeadline,
  onRetry,
  onCancel,
}: Props) {
  const qrDataUrl = usePaymentQrCode(invoice?.qr)
  const ark = invoice?.method === "ark"
  const bankQrUrl = useBankQrCode(paymentMethod === "bank_qr")
  // One confirmation at a time: a double tap must not complete twice.
  const [confirming, setConfirming] = useState(false)
  const msLeft = useCountdown(invoice?.expiresAt ?? 0)
  const cashMsLeft = useCountdown(cashDeadline ?? 0)

  // Paid, but the order didn't complete. No buttons: paying again or
  // starting over would be wrong. Staff use the reference to find the cart.
  if (paymentStatus === "needs_staff") {
    return (
      <div className="screen screen--center">
        <h1>{t.errorOrderIncomplete}</h1>
        <p className="payment-note">{t.cartReference(cart.id)}</p>
      </div>
    )
  }

  // Cash: confirming places the order with the payment still to be collected
  // at the front desk. Single column in both orientations: it's short.
  // Same red/green pair as bank QR's "Cancelar" and "Pagado".
  if (paymentMethod === "cash") {
    return (
      <div className="screen screen--center">
        <h1>{t.cashTitle(formatBs(cart.total))}</h1>
        <OrderLines cart={cart} />
        <p className="payment-note">{t.cashNote}</p>
        {cashDeadline && <p className="payment-countdown cash-countdown">{t.cashAutoIn(formatCountdown(cashMsLeft))}</p>}
        {error && <p className="payment-error" role="alert">{error}</p>}
        <div className="bank-qr-actions">
          <button className="bank-qr-cancel" onClick={onCancel} disabled={confirming}>
            {t.cancel}
          </button>
          <button
            className="bank-qr-paid"
            disabled={confirming}
            onClick={async () => {
              setConfirming(true)
              try {
                await onCashConfirm()
              } finally {
                setConfirming(false)
              }
            }}
          >
            {t.confirmOrder}
          </button>
        </div>
      </div>
    )
  }

  // The gym's static bank QR until the Baneco API exists (see CLAUDE.md): it
  // has no amount in it, and nothing checks the payment arrived ("Pagado").
  if (paymentMethod === "bank_qr") {
    return (
      <div className="screen screen--center payment-layout">
        <div className="payment-qrbox payment-qrbox--bank">
          {bankQrUrl ? (
            <img className="payment-qr payment-qr--bank" src={bankQrUrl} alt={t.bankQrAlt} />
          ) : (
            <div className="payment-qr payment-qr--placeholder" />
          )}
          {/* The bank's mark as on the front-desk card: white box on navy. Redrawn from a photo of the
              card in BCP's own blue and coral; swap for an official file if one turns up. */}
          <div className="bank-logo">
            <img src={`${KIOSK.assets}bcp-logo.png`} alt="BCP" draggable={false} />
          </div>
        </div>
        <div className="payment-side">
          <h1>{t.payAmount(formatBs(cart.total))}</h1>
          <p className="payment-note">{t.bankQrNote(formatBs(cart.total))}</p>
          {error && <p className="payment-error" role="alert">{error}</p>}
          <div className="bank-qr-actions">
            <button className="bank-qr-cancel" onClick={onCancel} disabled={confirming}>
              {t.cancel}
            </button>
            <button
              className="bank-qr-paid"
              disabled={confirming}
              onClick={async () => {
                setConfirming(true)
                try {
                  await onBankQrPaid()
                } finally {
                  setConfirming(false)
                }
              }}
            >
              {t.paid}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (paymentStatus === "expired") {
    return (
      <div className="screen screen--center">
        <h1>{t.invoiceExpired}</h1>
        <p className="payment-note">{t.invoiceExpiredNote}</p>
        <button className="primary-button" onClick={onRetry}>
          {t.tryAgain}
        </button>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="screen screen--center screen--black">
        <ByteLoader label={t.creatingInvoice} />
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  // Past the deadline the invoice can't be paid any more, so the QR goes,
  // but a payment sent in the last seconds may still be landing: keep
  // checking (useKiosk's grace period) rather than calling it expired.
  if (msLeft === 0) {
    return (
      <div className="screen screen--center">
        <h1>{t.payAmount(formatBs(invoice.bobAmount))}</h1>
        <p className="payment-note">{t.checkingPayment}</p>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  // Portrait stacks amounts, QR, logo, countdown, note and button in one column;
  // landscape puts the QR on the left and everything else on the right. The two
  // groups are layout-only (see App.css), so turning the tablet keeps the same
  // elements: the QR image is never rebuilt.
  return (
    <div className="screen screen--center payment-layout">
      <div className="payment-qrbox">
        {qrDataUrl ? (
          <img className="payment-qr" src={qrDataUrl} alt={ark ? t.arkQrAlt : t.lightningQrAlt} />
        ) : (
          <p className="payment-note">{t.generatingQr}</p>
        )}
      </div>
      <div className="payment-side">
        {/* The amount being charged (sats) leads; the Bs price follows, smaller. */}
        <div className="payment-amounts">
          <p className="payment-sats">{invoice.satsAmount.toLocaleString("es-BO")} sats</p>
          <p className="payment-bs">{formatBs(invoice.bobAmount)}</p>
        </div>
        {ark ? (
          <p className="payment-ark-mark">Bitcoin Ark</p>
        ) : (
          <img className="payment-logo" src={`${KIOSK.assets}lightning-logo.webp`} alt="Bitcoin Lightning Network" draggable={false} />
        )}
        <p className="payment-countdown">{t.expiresIn(formatCountdown(msLeft))}</p>
        <p className="payment-note">{ark ? t.scanArk : t.scanLightning}</p>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** The cart's lines (photo, quantity, name), styled like the done screen's list. */
function OrderLines({ cart }: { cart: HttpTypes.StoreCart }) {
  const items = cart.items ?? []
  if (!items.length) return null
  return (
    <section className="done-items cash-items">
      <h2 className="done-items__title">{t.yourPurchase}</h2>
      <ul className="done-items__list">
        {items.map((item) => (
          <li key={item.id} className="done-item">
            <div className="done-item__photo">
              {item.thumbnail && <img src={item.thumbnail} alt="" draggable={false} decoding="async" />}
            </div>
            <span className="done-item__qty">{item.quantity}×</span>
            <span className="done-item__text">
              <span className="done-item__name">{item.product_title ?? item.title}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
