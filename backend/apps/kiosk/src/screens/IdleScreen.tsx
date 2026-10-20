import { KIOSK } from "../lib/stageConfig"
import { t } from "../lib/strings"
import { LangFlags } from "./LangFlags"

/**
 * Full-strength doodle wall. Any tap starts a new order, except on the small
 * Wi-Fi button, which sits over one of the wall's little arrows (bottom right)
 * and opens the Wi-Fi and gym-access QR codes. It's a sibling of the wall
 * button, not inside it: a button can't contain another one.
 */
export function IdleScreen({ onStart, onConnect }: { onStart: () => void; onConnect: () => void }) {
  return (
    <>
      <button className="k-idle" onClick={onStart} aria-label={t.tapToStart}>
        <span className="k-idle__cta">
          {/* Byte's ball stretch (Second's mascot, used with permission), from the
              Kiosko Byte La Paz art set */}
          <img className="k-idle__byte" src={`${KIOSK.assets}art/07-byte-ball-stretch.webp`} alt="" />
          {t.tapToStart}
        </span>
      </button>
      <LangFlags className="k-flags--corner" />
      <button className="k-idle-connect" onClick={onConnect} aria-label={t.connectTitle}>
        <svg viewBox="0 0 40 40" aria-hidden>
          <path d="M5 16a21 21 0 0 1 30 0M10.5 21.5a13 13 0 0 1 19 0M16 27a5.5 5.5 0 0 1 8 0" />
          <circle cx="20" cy="32" r="2.2" />
        </svg>
      </button>
    </>
  )
}
