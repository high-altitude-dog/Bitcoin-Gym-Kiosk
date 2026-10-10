import { formatAmount } from "../lib/format"
import { KIOSK } from "../lib/stageConfig"
import { t } from "../lib/strings"
import type { KioskLine } from "../lib/kioskTypes"

/**
 * The order beside the products, shown in landscape in place of the order bar
 * (the stylesheet picks which of the two is visible, so both stay mounted and
 * turning the tablet remounts nothing). It lists what is in the order with its
 * own quantity steppers and the total, and holds "Pagar". Quantities are the
 * ones the cards show, taps still being saved included.
 */
export function OrderPanel({
  lines,
  itemCount,
  total,
  busy,
  onQty,
  onPay,
}: {
  lines: KioskLine[]
  itemCount: number
  total: number
  busy: boolean
  onQty: (variantId: string, quantity: number) => void
  onPay: () => void
}) {
  const empty = itemCount === 0
  return (
    <aside className="k-panel" aria-label={t.orderLabel}>
      <h2 className="k-panel__title">{t.orderLabel}</h2>
      <p className="k-panel__count">{empty ? t.orderCountEmpty : t.items(itemCount)}</p>
      {empty ? (
        <div className="k-panel__empty">
          {/* Byte's banana-power pose (Second's mascot, used with permission), from the Kiosko Byte La Paz art set */}
          <img className="k-panel__byte" src={`${KIOSK.assets}art/14-byte-banana-power.webp`} alt="" draggable={false} />
          <p>{t.orderEmpty}</p>
        </div>
      ) : (
        <ul className="k-panel__lines">
          {lines.map((line) => (
            <li key={line.variantId} className="k-line">
              <div className="k-line__photo">
                {line.thumbnail && <img src={line.thumbnail} alt="" draggable={false} decoding="async" />}
              </div>
              <div className="k-line__body">
                <span className="k-line__name">{line.title}</span>
                <div className="k-line__stepper" aria-label={t.inOrder(line.qty)}>
                  <button className="k-line__minus" onClick={() => onQty(line.variantId, line.qty - 1)} aria-label={t.remove(line.title)}>−</button>
                  <span className="k-line__qty" aria-live="polite">{line.qty}</span>
                  <button className="k-line__plus" onClick={() => onQty(line.variantId, line.qty + 1)} disabled={line.qty >= line.stock} aria-label={t.add(line.title)}>+</button>
                </div>
              </div>
              <span className="k-line__total">{t.currency} {formatAmount(line.price * line.qty)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="k-panel__foot">
        <div className="k-panel__total">
          <span>{t.orderTotal}</span>
          <strong>{t.currency} {formatAmount(total)}</strong>
        </div>
        <button className="k-pay k-panel__pay" disabled={empty || busy} onClick={onPay}>{t.pay}</button>
      </div>
    </aside>
  )
}
