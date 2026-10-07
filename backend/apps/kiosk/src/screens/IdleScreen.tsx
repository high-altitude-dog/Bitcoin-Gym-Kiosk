import { t } from "../lib/strings"

/** Full-strength doodle wall. Any tap starts a new order. */
export function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <button className="k-idle" onClick={onStart} aria-label={t.tapToStart}>
      <span className="k-idle__cta">
        <span className="k-idle__hand" aria-hidden="true">👆</span>
        {t.tapToStart}
      </span>
    </button>
  )
}
