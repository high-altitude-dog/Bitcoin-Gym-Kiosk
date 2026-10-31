import type { ReactNode } from "react"
import type { PaymentMethod } from "../state/useKiosk"
import { formatBs } from "../lib/money"
import { t } from "../lib/strings"
import { KIOSK_LOCATION } from "../lib/location"

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
  // "BIP321 Ark/Bolt12": null hides the button.
  onBip321: (() => void) | null
  onBack: () => void
}

/**
 * The kit's OrderBar has a single "Pagar" button and has no concept of payment methods at
 * all (payment is out of scope for it) — this screen is new, filling the gap so the existing
 * Lightning-vs-bank-QR choice (previously CartScreen's two buttons) has somewhere to live.
 */
// The method under "Pagar con Bitcoin" on each Bitcoin button: the same in both languages.
const RAIL = { lightning: "Bolt11", bip321: "Bolt12/Ark", ark: "Ark/Bolt11" } as const

/**
 * A Bitcoin option: "Pagar con Bitcoin" on one line and the method under it, so the
 * three Bitcoin buttons share a title and differ by method. Its full name ("Pagar con
 * Bitcoin - Bolt11") is the accessible label. While its taps are saving it shows only
 * "Guardando tu pedido…".
 */
function BitcoinOption(props: {
  method: keyof typeof RAIL
  label: string
  className: string
  savingFor: PaymentMethod
  onClick: () => void
  children?: ReactNode
}) {
  const busy = props.savingFor === props.method
  return (
    <button
      className={`k-method__option k-method__option--btc ${props.className}`}
      onClick={props.onClick}
      disabled={props.savingFor !== null}
      aria-busy={busy}
      aria-label={busy ? undefined : props.label}
    >
      {busy ? (
        t.savingOrder
      ) : (
        <span className="k-method__label">
          <span className="k-method__title">{t.payWithBitcoin}</span>
          <span className="k-method__rail">{RAIL[props.method]}</span>
        </span>
      )}
      {props.children}
    </button>
  )
}

export function PaymentMethodScreen({ total, savingFor, error, onLightning, onBankQr, onCash, onArk, onBip321, onBack }: Props) {
  const atGym = KIOSK_LOCATION !== null
  const saving = savingFor !== null
  return (
    <div className="k-method">
      <p className="k-method__total">{formatBs(total)}</p>
      <p>{t.choosePayment}</p>
      {error && <p className="k-method__error" role="alert">{error}</p>}
      {/* Two groups: Bitcoin first (Bolt11, Bolt12/Ark, then Ark/Bolt11 when shown),
          then the Bs options. Stacked in portrait; each group one row in landscape (kiosk.css). */}
      <div className="k-method__options">
        <div className="k-method__group k-method__group--btc">
          <BitcoinOption method="lightning" label={t.payWithLightning} className="" savingFor={savingFor} onClick={onLightning} />
          {onBip321 && (
            <BitcoinOption method="bip321" label={t.payWithBip321} className="k-method__option--bip321" savingFor={savingFor} onClick={onBip321}>
              {/* A diagonal sash across the bottom-right corner (design only, Oct 29, 2026:
                  no discount is applied yet). Its own clipping box keeps it inside the
                  rounded corner without the button itself overflowing. */}
              <span className="k-method__sash-clip" aria-hidden="true">
                <span className="k-method__sash">{t.bip321Discount}</span>
              </span>
            </BitcoinOption>
          )}
          {onArk && <BitcoinOption method="ark" label={t.payWithArk} className="k-method__option--ark" savingFor={savingFor} onClick={onArk} />}
        </div>
        <div className="k-method__group k-method__group--bs">
          {/* Bank QR and cash only on a kiosk opened with ?location= (lib/location.ts);
              the backend refuses them otherwise. */}
          <button className="k-method__option k-method__option--bank-qr" onClick={onBankQr} disabled={saving || !atGym} aria-busy={savingFor === "bank_qr"}>
            {savingFor === "bank_qr" ? t.savingOrder : t.payWithBankQr}
            {!atGym && <span className="k-method__only-gym">{t.onlyAtGym}</span>}
          </button>
          <button className="k-method__option k-method__option--cash" onClick={onCash} disabled={saving || !atGym} aria-busy={savingFor === "cash"}>
            {savingFor === "cash" ? t.savingOrder : t.payWithCash}
            {!atGym && <span className="k-method__only-gym">{t.onlyAtGym}</span>}
          </button>
        </div>
      </div>
      <button className="k-method__back" onClick={onBack}>{t.back}</button>
    </div>
  )
}
