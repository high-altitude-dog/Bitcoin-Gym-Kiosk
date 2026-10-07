import { KIOSK } from "../lib/stageConfig"
import { t } from "../lib/strings"

/** Full-strength doodle wall. Any tap starts a new order. */
export function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <button className="k-idle" onClick={onStart} aria-label={t.tapToStart}>
      <span className="k-idle__cta">
        {/* Byte's ball stretch (Second's mascot, used with permission), from the
            Kiosko Byte La Paz art set */}
        <img className="k-idle__byte" src={`${KIOSK.assets}art/07-byte-ball-stretch.webp`} alt="" />
        {t.tapToStart}
      </span>
    </button>
  )
}
