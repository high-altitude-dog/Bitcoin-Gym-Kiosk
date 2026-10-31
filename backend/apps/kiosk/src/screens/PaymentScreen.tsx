import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"
import { useCountdown, formatCountdown } from "../hooks/useCountdown"
import type { LightningInvoice } from "../lib/payment"
import { KIOSK } from "../lib/stageConfig"
import { ByteLoader } from "./ByteLoader"
import { DrawingRoom } from "./DrawingRoom"
import { WALLETS, walletOrder, type Wallet, type WalletId } from "../lib/wallets"
import { WalletCard } from "./WalletCard"
import { BANK_QR_OPTIONS, BANK_QR_PAYLOAD } from "../lib/bankQr"
import type { PaymentMethod, PaymentStatus } from "../state/useKiosk"

interface Props {
  cart: HttpTypes.StoreCart
  paymentMethod: PaymentMethod
  invoice: LightningInvoice | null
  // The invoice being created, for the traffic lights beside Byte.
  invoiceProgress: { token: string; requestedAt: number | null; arrived?: boolean } | null
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
  invoiceProgress,
  paymentStatus,
  error,
  onBankQrPaid,
  onCashConfirm,
  cashDeadline,
  onRetry,
  onCancel,
}: Props) {
  const qrDataUrl = usePaymentQrCode(invoice?.qr)
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
          {t.cancel}
        </button>
      </div>
    )
  }

  if (!invoice) {
    // Bitcoin: the drawing room, with the services' portraits on the wall.
    if (paymentMethod === "lightning" || paymentMethod === "ark" || paymentMethod === "bip321") {
      return (
        <div className="screen screen--room">
          <DrawingRoom method={paymentMethod} progress={invoiceProgress} caption={t.roomCaption}>
            <button className="back-button dr-cancel" onClick={onCancel}>
              {t.cancel}
            </button>
          </DrawingRoom>
        </div>
      )
    }
    return (
      <div className="screen screen--center screen--black">
        <ByteLoader label={t.creatingInvoice} />
        <button className="back-button" onClick={onCancel}>
          {t.cancel}
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
          {t.cancel}
        </button>
      </div>
    )
  }

  return <InvoiceQr invoice={invoice} qrDataUrl={qrDataUrl} msLeft={msLeft} onCancel={onCancel} />
}

// A wallet card closes by itself after this long without a touch, and when
// less than CARD_MIN_LEFT_MS is left on the invoice (or can't open then), so
// the member is never left without the QR (the developer, Oct 30, 2026).
const CARD_IDLE_MS = 20_000
const CARD_MIN_LEFT_MS = 60_000

/**
 * The Bitcoin QR screen. Portrait is one column: the amount, the QR card with
 * its time bar, the suggested wallets and "Cancelar". Landscape puts the QR
 * card on the left and the rest on the right. The two groups are layout-only
 * (see App.css), so turning the tablet keeps the same elements: the QR image
 * is never rebuilt. Tapping a wallet's logo shows its details card in the
 * QR's place (WalletCard.tsx); the QR stays mounted, hidden, and the time bar
 * keeps counting.
 */
function InvoiceQr({
  invoice,
  qrDataUrl,
  msLeft,
  onCancel,
}: {
  invoice: LightningInvoice
  qrDataUrl: string | null
  msLeft: number
  onCancel: () => void
}) {
  const method = invoice.method
  const ark = method === "ark"
  const bip321 = method === "bip321"
  const [open, setOpen] = useState<WalletId | null>(null)
  const [rubric, setRubric] = useState(false)
  const [touchedAt, setTouchedAt] = useState(0)
  const close = () => {
    setOpen(null)
    setRubric(false)
  }

  // A new invoice starts on its QR.
  useEffect(close, [invoice.qr])
  // Back to the QR after 20 s without a touch on the card.
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(close, CARD_IDLE_MS)
    return () => clearTimeout(timer)
  }, [open, rubric, touchedAt])
  // ... and when the invoice is about to run out.
  useEffect(() => {
    if (open && msLeft < CARD_MIN_LEFT_MS) close()
  }, [open, msLeft])

  const pick = (id: WalletId) => {
    if (open === id) return close()
    if (msLeft < CARD_MIN_LEFT_MS) return
    setOpen(id)
    setRubric(false)
    setTouchedAt(Date.now())
  }

  const left = invoice.durationMs > 0 ? Math.min(1, msLeft / invoice.durationMs) : null
  return (
    <div className={`screen screen--center payment-layout invoice invoice--${method}`}>
      <div className="payment-qrbox">
        <div className="invoice-qrcard" onPointerDown={() => open && setTouchedAt(Date.now())}>
          {qrDataUrl ? (
            <img className="payment-qr" src={qrDataUrl} alt={ark ? t.arkQrAlt : bip321 ? t.bip321QrAlt : t.lightningQrAlt} hidden={open !== null} />
          ) : (
            <p className="payment-note invoice-qr-pending" hidden={open !== null}>{t.generatingQr}</p>
          )}
          {open && <WalletCard id={open} rubric={rubric} onToggleRubric={() => { setRubric((r) => !r); setTouchedAt(Date.now()) }} onBack={close} />}
          <div className="invoice-timer">
            {left !== null && (
              <div className="invoice-timer__track" aria-hidden="true">
                <div className="invoice-timer__fill" style={{ width: `${left * 100}%` }} />
              </div>
            )}
            <p className="payment-countdown">{t.expiresIn(formatCountdown(msLeft))}</p>
          </div>
        </div>
      </div>
      <div className="payment-side">
        <div className="invoice-head">
          {/* The amount being charged (sats) leads; the Bs price follows, smaller. */}
          <div className="payment-amounts">
            <p className="payment-sats">{invoice.satsAmount.toLocaleString("es-BO")} sats</p>
            <p className="payment-bs">{formatBs(invoice.bobAmount)}</p>
          </div>
        </div>
        <section className="invoice-wallets" aria-label={t.scanWith}>
          <p className="invoice-wallets__title">{t.scanWith}</p>
          <p className="payment-note invoice-wallets__other">{ark ? t.scanArk : bip321 ? t.scanBip321 : t.scanLightning}</p>
          <p className="invoice-wallets__hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5.5m0-1a1.5 1.5 0 0 1 3 0v1m0-.5a1.5 1.5 0 0 1 3 0v4c0 3.6-2.4 6-6 6h-1c-2.2 0-3.6-1-4.8-2.8L4.6 15a1.5 1.5 0 0 1 2.4-1.8L9 15" />
              <path d="M6.5 6.5A4.5 4.5 0 0 1 14 3.6" />
            </svg>
            {t.walletTapHint}
          </p>
          {/* Keyed by the QR, so the pulse runs once per invoice and not on a turn. */}
          <ul key={invoice.qr} className="invoice-wallets__list invoice-wallets__list--pulse">
            {walletOrder(method, invoice.qr).map((id) => {
              const wallet: Wallet = WALLETS[id]
              const state = open === null ? "" : open === id ? " is-open" : " is-dim"
              return (
                <li key={id} className="invoice-wallet">
                  <button type="button" className={`invoice-wallet__tile${state}`} onClick={() => pick(id)} aria-label={t.walletMore(wallet.name)} aria-pressed={open === id}>
                    <span className="invoice-wallet__art">
                      {wallet.logo ? (
                        <img className="invoice-wallet__logo" src={`${KIOSK.assets}wallets/${wallet.logo}`} alt="" draggable={false} />
                      ) : (
                        <span className="invoice-wallet__logo invoice-wallet__logo--initial" aria-hidden="true">
                          {wallet.name.charAt(0)}
                        </span>
                      )}
                      <span className="invoice-wallet__badge" aria-hidden="true">i</span>
                    </span>
                    <span className="invoice-wallet__name">{wallet.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <button className="back-button" onClick={onCancel}>
          {t.cancel}
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
