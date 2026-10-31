import type { CSSProperties, ReactNode } from "react"
import { useOrientation } from "../hooks/useStage"
import { KIOSK } from "../lib/stageConfig"
import type { InvoiceMethod } from "../lib/payment"
import { useInvoiceLights, type Service } from "./InvoiceLights"
import "./drawing-room.css"

/**
 * The wait while a Bitcoin invoice is created (the developer's design, Oct 30,
 * 2026; mock-up https://claude.ai/artifact/CePGf4aFMdPSXVccdxoA5L): a
 * drawing room in white line on black, Byte's art style, with Byte jumping
 * through the magic hoops on a rug, a marble fireplace with a real-looking
 * fire, and (landscape) a cactus. The three outside services hang
 * on the wall as portraits (from the "Status-Dogs" artifact): each painting
 * and the halo around it show that service's status in red, amber or green
 * (useInvoiceLights). With only two services (Bolt11, Ark/Bolt11) the two
 * portraits hang closer together. Everything is laid out in stage pixels, one
 * geometry per orientation; turning keeps the same elements.
 */
type Hang = { x: number; y: number; w: number; rot: number }

type Geometry = {
  floorY: number
  byte: { x: number; w: number; feet: number }
  rug: { x: number; y: number; w: number; h: number }
  fp: { x: number; y: number; w: number; h: number }
  // Where the portraits hang: all three (Bolt12/Ark), or two closer together
  // when the method skips a service (Bolt11: no Bark; Ark/Bolt11: no Coinos).
  hang: Record<"all" | "noBark" | "noCoinos", Partial<Record<Service, Hang>>>
  cactus?: { x: number; w: number; h: number }
  captionY: number
}

const PORTRAIT: Geometry = {
  floorY: 1240,
  byte: { x: -40, w: 760, feet: 1330 },
  rug: { x: -240, y: 1272, w: 940, h: 145 },
  fp: { x: 790, y: 990, w: 460, h: 250 },
  hang: {
    all: {
      yadio: { x: 600, y: 330, w: 250, rot: -3.2 },
      bark: { x: 700, y: 670, w: 360, rot: -1.6 },
      coinos: { x: 950, y: 290, w: 230, rot: 2.6 },
    },
    noBark: {
      yadio: { x: 630, y: 430, w: 270, rot: -3.2 },
      coinos: { x: 936, y: 390, w: 244, rot: 2.6 },
    },
    noCoinos: {
      yadio: { x: 620, y: 440, w: 260, rot: -3.2 },
      bark: { x: 900, y: 480, w: 290, rot: 2.2 },
    },
  },
  captionY: 1520,
}

const LANDSCAPE: Geometry = {
  floorY: 880,
  byte: { x: -40, w: 900, feet: 950 },
  rug: { x: -260, y: 905, w: 1180, h: 135 },
  fp: { x: 1060, y: 650, w: 520, h: 230 },
  hang: {
    all: {
      yadio: { x: 900, y: 240, w: 240, rot: -3.2 },
      bark: { x: 1160, y: 250, w: 330, rot: 2.6 },
      coinos: { x: 1510, y: 200, w: 220, rot: -1.6 },
    },
    noBark: {
      yadio: { x: 1040, y: 220, w: 280, rot: -3.2 },
      coinos: { x: 1350, y: 180, w: 250, rot: 2.6 },
    },
    noCoinos: {
      yadio: { x: 1020, y: 230, w: 270, rot: -3.2 },
      bark: { x: 1320, y: 260, w: 340, rot: 2.2 },
    },
  },
  cactus: { x: 1736, w: 180, h: 315 },
  captionY: 1058,
}

// The portraits run left to right in the order their services usually answer
// (the developer, Oct 30, 2026): Yadio (cached), then Bark, then coinos.io.
// Height / width of each painting file (540 px wide copies in public/kiosk/status-dogs/).
const RATIO: Record<Service, number> = { coinos: 1214 / 900, yadio: 1, bark: 639 / 900 }
// Byte's hoops art is 606 x 326; his paws reach about y = 305 and the art's own
// dashed floor (cropped away) sits just below.
const ART_W = 606
const ART_H = 326
const PAWS_Y = 305

// Load every painting as soon as the app starts (this module loads with the
// payment screen), so a portrait never opens black or changes colour late,
// even right after a deploy when the offline cache is still filling.
const PRELOADED: HTMLImageElement[] = []
if (typeof window !== "undefined") {
  for (const service of ["coinos", "yadio", "bark"] as const)
    for (const c of ["red", "amber", "green"]) {
      const img = new Image()
      img.src = `${KIOSK.assets}status-dogs/${service}-${c}.webp`
      PRELOADED.push(img)
    }
}


export function DrawingRoom({
  method,
  progress,
  caption,
  children,
}: {
  method: InvoiceMethod
  progress: { token: string; requestedAt: number | null; arrived?: boolean } | null
  caption: string
  children?: ReactNode
}) {
  const landscape = useOrientation() === "landscape"
  const g = landscape ? LANDSCAPE : PORTRAIT
  const W = landscape ? 1920 : 1200
  const H = landscape ? 1200 : 1920
  const lights = useInvoiceLights(method, progress)
  const usedSet = new Set(lights.filter((l) => l.used).map((l) => l.service))
  const hang = g.hang[!usedSet.has("bark") ? "noBark" : !usedSet.has("coinos") ? "noCoinos" : "all"]
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const base = KIOSK.assets

  const k = g.byte.w / ART_W
  const cropH = Math.round(PAWS_Y * k)
  const px = (n: number) => `${n}px`
  const fpCx = g.fp.x + g.fp.w / 2

  // The skirting board; the cornice band and the gasolier came out on Oct 30, 2026 (the developer).
  const lines = [
    { y: g.floorY - 26, w: 2, dash: undefined, o: 0.85 },
    { y: g.floorY, w: 2.6, dash: undefined, o: 1 },
  ]

  return (
    <div className={`byte-loader drawing-room${reduceMotion ? " drawing-room--still" : ""}`} role="status" aria-label={caption}>
      {/* Wallpaper, cornice, floorboards and skirting in white line */}
      <svg className="dr-abs" width={W} height={H} aria-hidden>
        <defs>
          <pattern id="dr-paper" width="96" height="150" patternUnits="userSpaceOnUse">
            <path d="M0 0v150M7 0v150" stroke="#f5f5f5" strokeWidth="1.4" opacity="0.2" />
            <path
              d="M51 22c-11 10-11 24 0 33 11-9 11-23 0-33zM51 55v22M40 70c4-7 18-7 22 0M51 77c-6 6-14 6-18 0M51 77c6 6 14 6 18 0M51 98c-8 8-8 17 0 24 8-7 8-16 0-24z"
              fill="none" stroke="#f5f5f5" strokeWidth="1.4" opacity="0.2"
            />
          </pattern>
          <pattern id="dr-boards" width="420" height="112" patternUnits="userSpaceOnUse">
            <path d="M0 55.5h420M0 111.5h420M140 0v56M350 56v56" stroke="#f5f5f5" strokeWidth="1.4" opacity="0.16" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={g.floorY} fill="url(#dr-paper)" />
        <rect x="0" y={g.floorY} width={W} height={H - g.floorY} fill="url(#dr-boards)" />
        {lines.map((l) => (
          <line key={l.y} x1="0" y1={l.y} x2={W} y2={l.y} stroke="#f5f5f5" strokeWidth={l.w} strokeDasharray={l.dash} opacity={l.o} />
        ))}
      </svg>

      {/* Firelight on the floor in front of the hearth */}
      <div className="dr-floor-glow" style={{ left: px(fpCx - 360), top: px(g.floorY - 40) }} />

      <Fireplace style={{ left: px(g.fp.x), top: px(g.fp.y), width: px(g.fp.w), height: px(g.fp.h) }} />
      <div className="dr-hearth" style={{ left: px(g.fp.x - 24), top: px(g.floorY), width: px(g.fp.w + 48) }} />

      {g.cactus && <Cactus style={{ left: px(g.cactus.x), top: px(g.floorY + 18 - g.cactus.h), width: px(g.cactus.w), height: px(g.cactus.h) }} />}

      <Rug style={{ left: px(g.rug.x), top: px(g.rug.y), width: px(g.rug.w), height: px(g.rug.h) }} />

      {/* Byte through the magic hoops, the art's own dashed floor cropped away */}
      <div className="dr-byte" style={{ left: px(g.byte.x), top: px(g.byte.feet - cropH), width: px(g.byte.w), height: px(cropH) }}>
        {reduceMotion ? (
          <img className="byte-loader__art" src={`${base}byte/byte-magic-hoops-still.png`} width={g.byte.w} height={Math.round(ART_H * k)} alt="" />
        ) : (
          <video
            className="byte-loader__art"
            src={`${base}byte/byte-magic-hoops.webm`}
            poster={`${base}byte/byte-magic-hoops-still.png`}
            width={g.byte.w}
            height={Math.round(ART_H * k)}
            autoPlay
            loop
            muted
            playsInline
            disablePictureInPicture
            aria-hidden
          />
        )}
      </div>

      {/* The portraits, salon-hung above the mantel and a little crooked */}
      {lights.map((l) => {
        const h = hang[l.service]
        if (!l.used || !h) return null
        const height = Math.round(h.w * RATIO[l.service])
        const box: CSSProperties = { left: px(h.x), top: px(h.y), width: px(h.w), height: px(height) }
        return [
          <div
            key={l.service}
            className={`invoice-light invoice-light--${l.light} dr-painting dr-painting--${l.light}`}
            data-service={l.service}
            data-light={l.light}
            role="img"
            aria-label={`${l.label}: ${l.word}`}
            style={{ ...box, transform: `rotate(${h.rot}deg)` }}
          >
            {/* All three states stay loaded, so a change of colour never waits for an image. */}
            {(["red", "amber", "green"] as const).map((c) => (
              <img key={c} src={`${base}status-dogs/${l.service}-${c}.webp`} alt="" hidden={c !== l.light} />
            ))}
          </div>,
          <div key={`${l.service}-plaque`} className="dr-plaque" style={{ left: px(h.x + h.w / 2 - 82), top: px(h.y + height + 24) }} aria-hidden>
            {l.label}
          </div>,
        ]
      })}

      <p className="byte-loader__label dr-caption" style={{ top: px(g.captionY) }}>{caption}</p>
      {children}
    </div>
  )
}

function Fireplace({ style }: { style: CSSProperties }) {
  return (
    <svg className="dr-abs dr-fireplace" style={style} viewBox="0 0 460 260" preserveAspectRatio="none" aria-hidden>
      <defs>
        <radialGradient id="dr-embers" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd27a" /><stop offset="0.5" stopColor="#ff6a1a" /><stop offset="1" stopColor="#7a1406" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dr-bark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0f08" /><stop offset="0.25" stopColor="#5a3620" /><stop offset="0.55" stopColor="#6e4428" /><stop offset="1" stopColor="#20130a" />
        </linearGradient>
        <radialGradient id="dr-endgrain" cx="0.45" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#e9b779" /><stop offset="0.7" stopColor="#b47a43" /><stop offset="1" stopColor="#5a3620" />
        </radialGradient>
        <filter id="dr-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id="dr-softer" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12" /></filter>
        <filter id="dr-flicker" x="-30%" y="-40%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03 0.085" numOctaves={2} seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.9" />
        </filter>
        <filter id="dr-coals" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves={2} seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.5  0 0 0 0 0.1  0 0 0 -3 1.9" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="dr-barktex" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.5" numOctaves={3} seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 -2.4 1.5" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="dr-crack" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* surround in white line */}
      <g fill="none" stroke="#f5f5f5" strokeLinejoin="round" strokeLinecap="round">
        <rect x="1.5" y="4" width="457" height="18" rx="3" strokeWidth="2.6" />
        <path d="M8 28h444M14 34h432" strokeWidth="2" />
        <rect x="18" y="34" width="424" height="42" strokeWidth="2.2" />
        <rect x="160" y="40" width="140" height="28" rx="2" strokeWidth="2" />
        <path d="M190 54c12-9 28-9 40 0 12 9 28 9 40 0" strokeWidth="1.8" />
        <rect x="22" y="76" width="68" height="184" strokeWidth="2.4" />
        <rect x="370" y="76" width="68" height="184" strokeWidth="2.4" />
        <rect x="34" y="92" width="44" height="150" rx="2" strokeWidth="1.6" />
        <rect x="382" y="92" width="44" height="150" rx="2" strokeWidth="1.6" />
        <path d="M44 98v138M56 98v138M68 98v138M392 98v138M404 98v138M416 98v138" strokeWidth="1.2" opacity="0.7" />
        <rect x="90" y="76" width="280" height="184" strokeWidth="2.4" />
        <path d="M102 88h256v172M102 88v172" strokeWidth="1.4" opacity="0.7" />
      </g>
      {/* firebox and the fire */}
      <path d="M128 260V150a102 70 0 0 1 204 0v110z" fill="#000" />
      <ellipse className="dr-fire-back" cx="230" cy="205" rx="118" ry="78" fill="#ff6a20" filter="url(#dr-softer)" />
      <ellipse cx="230" cy="246" rx="96" ry="12" fill="#140805" />
      <ellipse className="dr-fire-glow" cx="230" cy="244" rx="92" ry="10" fill="#ff7a1a" filter="url(#dr-coals)" />
      <ellipse className="dr-fire-glow" cx="230" cy="240" rx="78" ry="10" fill="url(#dr-embers)" filter="url(#dr-soft)" />
      {/* back logs, crossed */}
      <g transform="rotate(-13 205 214)">
        <rect x="140" y="202" width="150" height="26" rx="13" fill="url(#dr-bark)" />
        <rect x="140" y="202" width="150" height="26" rx="13" fill="#000" filter="url(#dr-barktex)" />
        <path className="dr-fire-glow" d="M152 206c30-3 70-2 128 1" stroke="#ff8a2a" strokeWidth="2" fill="none" filter="url(#dr-crack)" />
      </g>
      <g transform="rotate(12 258 214)">
        <rect x="182" y="202" width="152" height="26" rx="13" fill="url(#dr-bark)" />
        <rect x="182" y="202" width="152" height="26" rx="13" fill="#000" filter="url(#dr-barktex)" />
        <ellipse cx="333" cy="215" rx="9" ry="13" fill="url(#dr-endgrain)" />
        <path d="M333 207a5 8 0 1 0 .1 0M333 211a2.5 4 0 1 0 .1 0" fill="none" stroke="#7a4c24" strokeWidth="1" />
      </g>
      {/* flames rise between the logs */}
      <g filter="url(#dr-flicker)">
        <g transform="translate(230 226)">
          <g className="dr-flame dr-flame--main">
            <path d="M-80 6c-12-38 6-64 20-90 4 24 14 34 22 40 0-34 12-62 34-88 2 38 20 58 28 84 6-16 10-30 4-48 24 24 34 56 26 102z" fill="#b8280a" opacity="0.85" filter="url(#dr-soft)" />
            <path d="M-66 6c-10-34 6-56 18-76 4 22 12 30 20 36 0-30 10-54 30-78 2 34 18 52 24 74 6-14 8-26 4-42 20 22 28 50 20 86z" fill="#ff5e14" />
            <path d="M-46 6c-6-24 4-40 14-56 4 16 10 22 16 28 0-22 6-38 20-56 2 24 14 38 18 56 4-10 6-18 4-30 14 16 18 36 14 58z" fill="#ffa526" />
            <path d="M-26 6c-4-16 2-26 8-36 2 10 6 16 12 18 0-14 4-24 12-34 2 16 8 24 10 36 2-6 4-10 2-16 8 10 10 20 6 32z" fill="#ffdc7a" />
            <path d="M-12 6c-2-10 2-16 6-20 2 6 4 8 6 9 2-6 4-11 7-15 2 9 4 16 3 26z" fill="#fff6d8" />
          </g>
        </g>
        <g transform="translate(178 232)">
          <g className="dr-flame dr-flame--left">
            <path d="M-22 0c-6-24 8-40 10-62 10 16 22 34 18 62z" fill="#ff5e14" />
            <path d="M-13 0c-2-16 4-26 6-40 7 12 13 22 10 40z" fill="#ffc64a" />
          </g>
        </g>
        <g transform="translate(284 232)">
          <g className="dr-flame dr-flame--right">
            <path d="M-17 0c-6-26 6-44 8-66 11 18 21 38 17 66z" fill="#ff5e14" />
            <path d="M-10 0c-2-18 4-28 6-44 7 14 13 26 9 44z" fill="#ffd36a" />
          </g>
        </g>
      </g>
      {/* front log, big, over the base of the flames */}
      <g transform="rotate(-3 230 238)">
        <rect x="132" y="224" width="196" height="32" rx="16" fill="url(#dr-bark)" />
        <rect x="132" y="224" width="196" height="32" rx="16" fill="#000" filter="url(#dr-barktex)" />
        <path d="M150 228c40-4 100-4 160 0" stroke="#1a0d06" strokeWidth="5" fill="none" opacity="0.8" />
        <path className="dr-fire-glow" d="M154 229c20-2 40-2 60 0M232 228c24-1 50-1 74 1M170 252c30 2 60 2 90 0" stroke="#ff8a2a" strokeWidth="2.2" fill="none" filter="url(#dr-crack)" />
        <ellipse cx="134" cy="240" rx="11" ry="16" fill="url(#dr-endgrain)" />
        <path d="M134 230a6 10 0 1 0 .1 0M134 235a3 5 0 1 0 .1 0" fill="none" stroke="#7a4c24" strokeWidth="1.1" />
        <path d="M124 236l8 3M126 247l7-3" stroke="#3a2210" strokeWidth="1.2" />
      </g>
      {/* sparks */}
      <circle className="dr-spark dr-spark--1" cx="215" cy="190" r="1.7" fill="#ffd27a" />
      <circle className="dr-spark dr-spark--2" cx="250" cy="196" r="1.4" fill="#ffb347" />
      {/* arch, grate and fender in white line, in front of the fire */}
      <g fill="none" stroke="#f5f5f5" strokeLinecap="round">
        <path d="M128 260V150a102 70 0 0 1 204 0v110" strokeWidth="2.6" />
        <path d="M118 260V148a112 78 0 0 1 224 0v112" strokeWidth="1.4" opacity="0.7" />
        <path d="M148 258h164" strokeWidth="2.2" />
        <path d="M86 246h288v13H86z" strokeWidth="2.2" />
        <path d="M100 252.5h260" strokeWidth="1.4" strokeDasharray="5 6" opacity="0.8" />
        <circle cx="86" cy="252" r="6" strokeWidth="2" />
        <circle cx="374" cy="252" r="6" strokeWidth="2" />
      </g>
    </svg>
  )
}

function Rug({ style }: { style: CSSProperties }) {
  return (
    <svg className="dr-abs" style={style} viewBox="0 0 800 140" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id="dr-motif" width="40" height="26" patternUnits="userSpaceOnUse">
          <path d="M20 4l8 9-8 9-8-9z" fill="#474747" stroke="#bdbdbd" strokeWidth="1.3" />
          <circle cx="20" cy="13" r="2" fill="#d9d9d9" />
        </pattern>
      </defs>
      <g fill="none" stroke="#f5f5f5" strokeLinejoin="round">
        <polygon points="70,1.5 730,1.5 798.5,128 1.5,128" strokeWidth="3" fill="#2b2b2b" />
        <polygon points="86,7 714,7 776,122 24,122" strokeWidth="1.6" fill="#555" />
        <polygon points="98,13 702,13 758,116 42,116" strokeWidth="1.6" fill="#3a3a3a" />
        <polygon points="118,22 682,22 730,106 70,106" strokeWidth="2" fill="#1f1f1f" />
        <polygon points="118,22 682,22 730,106 70,106" strokeWidth="0" fill="url(#dr-motif)" />
        <ellipse cx="400" cy="64" rx="122" ry="27" strokeWidth="2.4" fill="#4a4a4a" />
        <ellipse cx="400" cy="64" rx="96" ry="19" strokeWidth="1.4" fill="#2e2e2e" />
        <ellipse cx="400" cy="64" rx="56" ry="11" strokeWidth="2" fill="#6a6a6a" />
        <path d="M344 64h-30M456 64h30M400 37v-10M400 91v10" strokeWidth="1.6" />
        <path d="M2 134h796" stroke="#bdbdbd" strokeWidth="10" strokeDasharray="1.6 7" opacity="0.8" />
      </g>
    </svg>
  )
}

function Cactus({ style }: { style: CSSProperties }) {
  const trunk = "M94 306V74c0-19 11-32 26-32s26 13 26 32v232z"
  const armL = "M100 204c-32 0-48-12-48-42V96c0-13 8-22 19-22s19 9 19 22v56c0 9 4 13 12 13z"
  const armR = "M140 240c32 0 46-11 46-40v-48c0-13-8-22-19-22s-19 9-19 22v40c0 9-4 13-10 13z"
  return (
    <svg className="dr-abs" style={style} viewBox="0 0 240 420" aria-hidden>
      <defs>
        <linearGradient id="dr-rib" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1e4220" /><stop offset="0.45" stopColor="#5f9d4e" /><stop offset="0.6" stopColor="#4f8a42" /><stop offset="1" stopColor="#1e4220" />
        </linearGradient>
        <pattern id="dr-ribs" width="11" height="40" patternUnits="userSpaceOnUse">
          <rect width="11" height="40" fill="url(#dr-rib)" />
        </pattern>
        <pattern id="dr-areo" width="11" height="15" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="7" r="1.6" fill="#d9d2b6" />
          <path d="M5.5 7l-4.5-3.5M5.5 7l4.5-3.5M5.5 7l-4.5 3M5.5 7l4.5 3M5.5 7v-6M5.5 7l-2 5M5.5 7l2 5" stroke="#efe8cf" strokeWidth="0.6" opacity="0.9" />
        </pattern>
        <linearGradient id="dr-round" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" /><stop offset="0.3" stopColor="#fff" stopOpacity="0.12" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {[armL, armR, trunk].map((d) => (
        <g key={d}>
          <path d={d} fill="url(#dr-ribs)" />
          <path d={d} fill="url(#dr-round)" />
          <path d={d} fill="url(#dr-areo)" />
        </g>
      ))}
      <g transform="translate(120 44)">
        <path d="M0 0c-6-10-16-12-20-6 6 2 12 6 14 10-8 0-14 6-12 10 6-4 12-6 18-6 6 0 12 2 18 6 2-4-4-10-12-10 2-4 8-8 14-10-4-6-14-4-20 6z" fill="#e8558f" />
        <path d="M0 2c-4-6-10-8-12-4 4 2 8 4 10 6-4 0-8 2-8 6 4-2 8-4 10-4 2 0 6 2 10 4 0-4-4-6-8-6 2-2 6-4 10-6-2-4-8-2-12 4z" fill="#ff93bd" />
        <circle cx="0" cy="4" r="3.5" fill="#ffd34d" />
      </g>
      {/* the pot in white line */}
      <g fill="#000" stroke="#f5f5f5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M64 316h112l-12 94H76z" strokeWidth="3" />
        <rect x="56" y="298" width="128" height="20" rx="4" strokeWidth="3" />
        <path d="M82 330c12 6 64 6 76 0" fill="none" strokeWidth="1.4" opacity="0.6" />
      </g>
    </svg>
  )
}
