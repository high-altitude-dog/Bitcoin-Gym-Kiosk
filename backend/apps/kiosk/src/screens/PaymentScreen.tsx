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
        <h1>Pagar {formatBs(cart.total)}</h1>
        <div className="payment-qr payment-qr--placeholder">
          <span>El QR aparecerá aquí</span>
        </div>
        <p className="payment-note">El QR bancario estará disponible pronto. Escanea con tu app del banco para pagar.</p>
        <button className="back-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    )
  }

  if (paymentStatus === "expired") {
    return (
      <div className="screen screen--center">
        <h1>La factura venció</h1>
        <p className="payment-note">La factura Lightning no se pagó a tiempo.</p>
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
        <p className="payment-note">Creando la factura Lightning...</p>
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
        <img className="payment-qr" src={qrDataUrl} alt="Código QR de la factura Lightning" />
      ) : (
        <p className="payment-note">Generando código QR...</p>
      )}
      <p className="payment-sats">{invoice.satsAmount.toLocaleString()} sats</p>
      <p className="payment-countdown">Vence en {formatCountdown(msLeft)}</p>
      <p className="payment-note">Escanea con una billetera Lightning para pagar.</p>
      <button className="back-button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}
