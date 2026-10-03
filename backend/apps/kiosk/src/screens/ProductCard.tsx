import { formatAmount } from "../lib/format"
import { useFitText } from "../hooks/useFitText"
import { t } from "../lib/strings"
import type { KioskProduct } from "../lib/kioskTypes"

export function ProductCard({ product, qty, onQty }: { product: KioskProduct; qty: number; onQty: (n: number) => void }) {
  const nameRef = useFitText<HTMLHeadingElement>(product.title, 30, 24)
  const inOrder = qty > 0
  const cls = ["k-card", inOrder && "k-card--in-order", product.soldOut && "k-card--sold-out"].filter(Boolean).join(" ")
  return (
    <article className={cls}>
      {!product.soldOut && !inOrder && (
        <button className="k-card__tap" onClick={() => onQty(1)} aria-label={t.add(product.title)} />
      )}
      <div className="k-card__photo">
        {product.thumbnail && (
          <img className="k-card__img" src={product.thumbnail} alt="" draggable={false} decoding="async" />
        )}
      </div>
      <h3 className="k-card__name" ref={nameRef}>{product.title}</h3>
      <p className="k-card__price">
        <span className="k-card__currency">{t.currency}</span>
        <span className="k-card__amount">{formatAmount(product.price)}</span>
      </p>
      {product.soldOut ? (
        <span className="k-card__sold-out">{t.soldOut}</span>
      ) : inOrder ? (
        <div className="k-stepper" aria-label={t.inOrder(qty)}>
          <button className="k-stepper__minus" onClick={() => onQty(qty - 1)} aria-label={t.remove(product.title)}>−</button>
          <span className="k-stepper__qty" aria-live="polite">{qty}</span>
          <button className="k-stepper__plus" onClick={() => onQty(qty + 1)} aria-label={t.add(product.title)}>+</button>
        </div>
      ) : (
        <button className="k-add" onClick={() => onQty(1)} aria-label={t.add(product.title)}>+</button>
      )}
    </article>
  )
}

export function SkeletonCard() {
  return (
    <article className="k-card k-card--skeleton" aria-hidden>
      <div className="k-card__photo" />
    </article>
  )
}
