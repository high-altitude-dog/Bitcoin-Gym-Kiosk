import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { OPEN_GYM_URL, WIFI_QR_PAYLOAD } from "../lib/connectQr"
import { t } from "../lib/strings"

// Drawn once when the app loads, so the screen opens with both codes ready.
const draw = (text: string | null) =>
  text ? QRCode.toDataURL(text, { width: 520, margin: 1 }).catch(() => null) : Promise.resolve(null)
const wifiQr = draw(WIFI_QR_PAYLOAD)
const accessQr = draw(OPEN_GYM_URL)

function useQr(image: Promise<string | null>) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void image.then((u) => !cancelled && setUrl(u))
    return () => {
      cancelled = true
    }
  }, [image])
  return url
}

/**
 * A QR hidden under a "Toca para mostrar" cover until tapped, so a phone held
 * up nearby doesn't scan it by accident. The image itself is hidden (not just
 * covered) until then. Covered again each time the screen opens.
 */
function RevealQr({ src, alt }: { src: string | null; alt: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="connect-card__qr connect-reveal" data-revealed={revealed}>
      {src && <img className="connect-reveal__img" src={src} alt={revealed ? alt : ""} draggable={false} />}
      {!revealed && (
        <button className="connect-reveal__cover" onClick={() => setRevealed(true)} aria-label={`${t.tapToReveal}: ${alt}`}>
          <span className="connect-reveal__tap" aria-hidden>
            <span className="connect-reveal__ring" />
            <span className="connect-reveal__ring connect-reveal__ring--late" />
            <span className="connect-reveal__dot" />
          </span>
          <span className="connect-reveal__label">{t.tapToReveal}</span>
        </button>
      )}
    </div>
  )
}

/** Two QR codes: the gym's Wi-Fi and the open-gym app. Side by side in landscape, stacked in portrait. */
export function ConnectScreen({ onBack }: { onBack: () => void }) {
  const wifi = useQr(wifiQr)
  const access = useQr(accessQr)
  return (
    <div className="screen connect">
      <h1 className="connect__title">{t.connectTitle}</h1>
      <div className="connect__cards">
        <section className="connect-card">
          {WIFI_QR_PAYLOAD ? (
            <RevealQr src={wifi} alt={t.wifiLabel} />
          ) : (
            <div className="connect-card__qr connect-card__qr--placeholder">{t.comingSoon}</div>
          )}
          <h2 className="connect-card__label">{t.wifiLabel}</h2>
          <p className="connect-card__note">{t.wifiNote}</p>
        </section>
        <section className="connect-card">
          <RevealQr src={access} alt={t.accessLabel} />
          <h2 className="connect-card__label">{t.accessLabel}</h2>
          <p className="connect-card__note">{t.accessNote}</p>
        </section>
      </div>
      <button className="k-method__back connect__back" onClick={onBack}>{t.back}</button>
    </div>
  )
}
