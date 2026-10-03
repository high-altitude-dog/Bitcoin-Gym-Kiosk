import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"

interface Props {
  cart: HttpTypes.StoreCart
  onLightning: () => void
  onBankQr: () => void
  onBack: () => void
}

/**
 * The kit's OrderBar has a single "Pagar" button and has no concept of payment methods at
 * all (payment is out of scope for it) — this screen is new, filling the gap so the existing
 * Lightning-vs-bank-QR choice (previously CartScreen's two buttons) has somewhere to live.
 */
export function PaymentMethodScreen({ cart, onLightning, onBankQr, onBack }: Props) {
  return (
    <div className="k-method">
      <p className="k-method__total">{formatBs(cart.total)}</p>
      <p>{t.choosePayment}</p>
      <button className="k-method__option" onClick={onLightning}>{t.payWithLightning}</button>
      <button className="k-method__option k-method__option--secondary" onClick={onBankQr}>{t.payWithBankQr}</button>
      <button className="k-method__back" onClick={onBack}>{t.back}</button>
    </div>
  )
}
