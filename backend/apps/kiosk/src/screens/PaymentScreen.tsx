import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"
import { useCountdown, formatCountdown } from "../hooks/useCountdown"
import type { LightningInvoice } from "../lib/payment"
import type { PaymentMethod, PaymentStatus } from "../state/useKiosk"

interface Props {
  cart: HttpTypes.StoreCart
  paymentMethod: PaymentMethod
  invoice: LightningInvoice | null
  paymentStatus: PaymentStatus
  error: string | null
  onBankQrPaid: () => Promise<void>
  onRetry: () => void
  onCancel: () => void
}

function usePaymentQrCode(bolt11: string | undefined) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!bolt11) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(`lightning:${bolt11}`, { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [bolt11])

  return qrDataUrl
}

export function PaymentScreen({
  cart,
  paymentMethod,
  invoice,
  paymentStatus,
  error,
  onBankQrPaid,
  onRetry,
  onCancel,
}: Props) {
  const qrDataUrl = usePaymentQrCode(invoice?.bolt11)
  // One confirmation at a time: a double tap must not complete twice.
  const [confirming, setConfirming] = useState(false)
  const msLeft = useCountdown(invoice?.expiresAt ?? 0)

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

  // Placeholder while the Baneco API request is pending (see CLAUDE.md):
  // a static square instead of a real bank QR invoice.
  if (paymentMethod === "bank_qr") {
    return (
      <div className="screen screen--center">
        <h1>Pagar {formatBs(cart.total)}</h1>
        <div className="payment-qr payment-qr--placeholder">
          <span>El QR aparecerá aquí</span>
        </div>
        <p className="payment-note">El QR bancario estará disponible pronto. Escanea con tu app del banco para pagar.</p>
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
    )
  }

  if (paymentStatus === "expired") {
    return (
      <div className="screen screen--center">
        <h1>La factura venció</h1>
        <p className="payment-note">La factura de Bitcoin⚡ no se pagó a tiempo.</p>
        <button className="primary-button" onClick={onRetry}>
          Intentar de nuevo
        </button>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="screen screen--center">
        <h1>Pagar {formatBs(cart.total)}</h1>
        <p className="payment-note">Creando la factura de Bitcoin⚡...</p>
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
        <h1>Pagar {formatBs(invoice.bobAmount)}</h1>
        <p className="payment-note">{t.checkingPayment}</p>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className="screen screen--center">
      <h1>Pagar {formatBs(invoice.bobAmount)}</h1>
      {qrDataUrl ? (
        <img className="payment-qr" src={qrDataUrl} alt="Código QR de la factura de Bitcoin⚡" />
      ) : (
        <p className="payment-note">Generando código QR...</p>
      )}
      <p className="payment-sats">{invoice.satsAmount.toLocaleString()} sats</p>
      <p className="payment-countdown">Vence en {formatCountdown(msLeft)}</p>
      <p className="payment-note">Escanea con una billetera Bitcoin⚡ para pagar.</p>
      <button className="back-button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}
