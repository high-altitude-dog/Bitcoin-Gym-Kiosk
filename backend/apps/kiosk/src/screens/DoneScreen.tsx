import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"
import { KIOSK } from "../lib/stageConfig"
import { t } from "../lib/strings"

interface Props {
  // null while a confirmed Lightning payment's order is still being created:
  // the screen shows "¡Pago recibido!", "#…", and no list or button yet.
  order: HttpTypes.StoreOrder | null
  // Cash: the order is placed but not paid yet; the member pays at the
  // front desk, quoting the order number.
  payAtDesk: boolean
  onNewOrder: () => void
}

export function DoneScreen({ order, payAtDesk, onNewOrder }: Props) {
  const items = order?.items ?? []
  // Byte gives up room as the list grows, so the list and "Nuevo pedido"
  // stay on the stage; a long list scrolls inside its card.
  const size = items.length <= 3 ? "lg" : items.length <= 5 ? "md" : "sm"
  const allSelfServe = items.every((item) => deliveryOf(item.product_type) === null)
  return (
    <div className={`screen screen--center done done--${size}`}>
      {/* Two groups, layout-only: stacked in portrait, side by side in landscape (App.css) */}
      <div className="done-hero">
        <h1 className={payAtDesk ? "done-title done-title--desk" : "done-title"}>{payAtDesk ? t.payAtDesk : order ? "¡Gracias!" : t.paymentReceived}</h1>
        <BoneReward />
        <p className="done-order">
          <span className="done-order__label">Tu pedido</span>
          <span className="done-order__number">#{order?.display_id ?? "…"}</span>
        </p>
        {payAtDesk && order && <p className="done-due">{t.cashDue(formatBs(order.total))}</p>}
      </div>
      <div className="done-side">
        {items.length > 0 && (
          <section className="done-items">
            <h2 className="done-items__title">{allSelfServe && !payAtDesk ? t.takeYourItems : t.yourPurchase}</h2>
            <ul className="done-items__list">
              {items.map((item) => {
                const delivery = deliveryOf(item.product_type)
                return (
                  <li key={item.id} className="done-item">
                    <div className="done-item__photo">
                      {item.thumbnail && <img src={item.thumbnail} alt="" draggable={false} decoding="async" />}
                    </div>
                    <span className="done-item__qty">{item.quantity}×</span>
                    <span className="done-item__text">
                      <span className="done-item__name">{item.product_title ?? item.title}</span>
                      {delivery && <span className="done-item__note">{delivery}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {/* Hidden until the order exists, so nobody leaves before seeing its number. */}
        {order && (
          <button className="primary-button done-new" onClick={onNewOrder}>
            Nuevo pedido
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * How a line reaches the member, from the product Type snapshot on the order
 * line. Mirrors the backend's FULFILLMENT_TYPES (backend/apps/backend/src/lib/
 * fulfillment-mode.ts): no type, or any other, means self-serve (null here).
 */
function deliveryOf(productType: string | null | undefined): string | null {
  const value = productType?.trim().toLowerCase()
  if (value === "entrega del personal") return t.deliveredByStaff
  if (value === "café asociado") return t.deliveredByCafe
  return null
}

/**
 * Byte's "bone reward" loop, from the "Kiosko Byte La Paz" art set (Second's
 * mascot, used with permission). The large on-dark GIF converted unaltered to
 * a looping WebM, for the same reasons as ByteLoader. Its ground is #1c1c1c,
 * the kiosk's --k-bg, so it sits on the screen with no visible square.
 * Reduced motion gets the first frame.
 */
function BoneReward() {
  const base = `${KIOSK.assets}byte/`
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return reduceMotion ? (
    <img className="done-art" src={`${base}byte-bone-reward-still.png`} width={800} height={800} alt="" />
  ) : (
    <video
      className="done-art"
      src={`${base}byte-bone-reward.webm`}
      poster={`${base}byte-bone-reward-still.png`}
      width={800}
      height={800}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      aria-hidden
    />
  )
}
