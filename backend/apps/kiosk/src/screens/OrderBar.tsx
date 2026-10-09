import { formatAmount } from "../lib/format"
import { t } from "../lib/strings"

export function OrderBar({
  itemCount,
  total,
  busy,
  onPay,
}: {
  itemCount: number
  total: number
  busy: boolean
  onPay: () => void
}) {
  const empty = itemCount === 0
  return (
    <footer className="k-bar">
      <div>
        <div className="k-bar__label">{empty ? t.orderEmpty : `${t.orderLabel} · ${t.items(itemCount)}`}</div>
        {!empty && <div className="k-bar__total">{t.currency} {formatAmount(total)}</div>}
      </div>
      <button className="k-pay" disabled={empty || busy} onClick={onPay}>{t.pay}</button>
    </footer>
  )
}
