import type { PaymentMethod } from "../state/useKiosk"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"

interface Props {
  // The order bar's total: the cart plus any taps still being saved.
  total: number
  // The button tapped while those taps were being saved, if any.
  savingFor: PaymentMethod
  error: string | null
  onLightning: () => void
  onBankQr: () => void
  onCash: () => void
  // "Bitcoin Ark": null hides the button (Bark Pay not configured).
  onArk: (() => void) | null
  onBack: () => void
}

/**
 * The kit's OrderBar has a single "Pagar" button and has no concept of payment methods at
 * all (payment is out of scope for it) — this screen is new, filling the gap so the existing
 * Lightning-vs-bank-QR choice (previously CartScreen's two buttons) has somewhere to live.
 */
export function PaymentMethodScreen({ total, savingFor, error, onLightning, onBankQr, onCash, onArk, onBack }: Props) {
  const saving = savingFor !== null
  return (
    <div className="k-method">
      <p className="k-method__total">{formatBs(total)}</p>
      <p>{t.choosePayment}</p>
      {error && <p className="k-method__error" role="alert">{error}</p>}
      {/* Stacked in portrait, side by side in landscape (see kiosk.css) */}
      <div className="k-method__options">
        <button className="k-method__option" onClick={onLightning} disabled={saving} aria-busy={savingFor === "lightning"}>
          {savingFor === "lightning" ? t.savingOrder : t.payWithLightning}
        </button>
        <button className="k-method__option k-method__option--bank-qr" onClick={onBankQr} disabled={saving} aria-busy={savingFor === "bank_qr"}>
          {savingFor === "bank_qr" ? t.savingOrder : t.payWithBankQr}
        </button>
        <button className="k-method__option k-method__option--cash" onClick={onCash} disabled={saving} aria-busy={savingFor === "cash"}>
          {savingFor === "cash" ? t.savingOrder : t.payWithCash}
        </button>
        {onArk && (
          <button className="k-method__option k-method__option--ark" onClick={onArk} disabled={saving} aria-busy={savingFor === "ark"}>
            {savingFor === "ark" ? t.savingOrder : t.payWithArk}
          </button>
        )}
      </div>
      <button className="k-method__back" onClick={onBack}>{t.back}</button>
    </div>
  )
}
