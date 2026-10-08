import type { HttpTypes } from "@medusajs/types"
import { KIOSK } from "../lib/stageConfig"

interface Props {
  order: HttpTypes.StoreOrder
  onNewOrder: () => void
}

export function DoneScreen({ order, onNewOrder }: Props) {
  return (
    <div className="screen screen--center done">
      <h1 className="done-title">¡Gracias!</h1>
      <BoneReward />
      <p className="done-order">
        <span className="done-order__label">Tu pedido</span>
        <span className="done-order__number">#{order.display_id}</span>
      </p>
      <button className="primary-button done-new" onClick={onNewOrder}>
        Nuevo pedido
      </button>
    </div>
  )
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
