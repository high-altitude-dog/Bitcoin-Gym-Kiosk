import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { useCountdown, formatCountdown } from "../hooks/useCountdown"
import type { LightningInvoice } from "../lib/payment"
import type { PaymentMethod, PaymentStatus } from "../state/useKiosk"

interface Props {
  cart: HttpTypes.StoreCart
  paymentMethod: PaymentMethod
  invoice: LightningInvoice | null
  paymentStatus: PaymentStatus
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
  onRetry,
  onCancel,
}: Props) {
  const qrDataUrl = usePaymentQrCode(invoice?.bolt11)
  const msLeft = useCountdown(invoice?.expiresAt ?? 0)

  // Placeholder while the Baneco API request is pending (see CLAUDE.md):
  // a static square instead of a real bank QR invoice.
  if (paymentMethod === "bank_qr") {
    return (
      <div className="screen screen--center">
        <h1>Pay {formatBs(cart.total)}</h1>
        <div className="payment-qr payment-qr--placeholder">
          <span>QR goes here</span>
        </div>
        <p className="payment-note">Bank QR is coming soon. Scan with your bank app to pay.</p>
        <button className="back-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  if (paymentStatus === "expired") {
    return (
      <div className="screen screen--center">
        <h1>Invoice expired</h1>
        <p className="payment-note">The Lightning invoice was not paid in time.</p>
        <button className="primary-button" onClick={onRetry}>
          Try again
        </button>
        <button className="back-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="screen screen--center">
        <h1>Pay {formatBs(cart.total)}</h1>
        <p className="payment-note">Creating the Lightning invoice...</p>
        <button className="back-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="screen screen--center">
      <h1>Pay {formatBs(invoice.bobAmount)}</h1>
      {qrDataUrl ? (
        <img className="payment-qr" src={qrDataUrl} alt="Lightning invoice QR code" />
      ) : (
        <p className="payment-note">Generating QR code...</p>
      )}
      <p className="payment-sats">{invoice.satsAmount.toLocaleString()} sats</p>
      <p className="payment-countdown">Expires in {formatCountdown(msLeft)}</p>
      <p className="payment-note">Scan with a Lightning wallet to pay.</p>
      <button className="back-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
