import { useId } from "react"
import { setLang, t, useLang, type Lang } from "../lib/strings"

/**
 * Two small flags: Bolivia (Spanish) and the United Kingdom (English). The
 * current one is full strength with a thin ring, the other dimmed. Drawn as
 * SVG, so they look the same on every device (no emoji fonts needed).
 */
export function LangFlags({ className = "" }: { className?: string }) {
  const lang = useLang()
  const flag = (code: Lang, label: string, art: JSX.Element) => (
    <button
      className="k-flag"
      aria-pressed={lang === code}
      aria-label={label}
      lang={code}
      onClick={(e) => {
        e.stopPropagation()
        setLang(code)
      }}
    >
      {art}
    </button>
  )
  return (
    <div className={`k-flags ${className}`}>
      {flag("es", t.langEs, <BoliviaFlag />)}
      {flag("en", t.langEn, <UkFlag />)}
    </div>
  )
}

function BoliviaFlag() {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden>
      <rect width="3" height="0.667" fill="#d52b1e" />
      <rect y="0.667" width="3" height="0.667" fill="#f9e300" />
      <rect y="1.333" width="3" height="0.667" fill="#007934" />
    </svg>
  )
}

// The Union Jack, cropped to 3:2 like the Bolivian flag beside it.
function UkFlag() {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <clipPath id={`${id}s`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`${id}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${id}s)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  )
}
