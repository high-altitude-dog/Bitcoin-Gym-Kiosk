import { KIOSK } from "../lib/stageConfig"
import { t, useLang } from "../lib/strings"
import { WALLETS, WALLET_INFO, type WalletId } from "../lib/wallets"
import { BoliviaFlag, UkFlag } from "./LangFlags"
import "./wallet-card.css"

/**
 * A wallet's details, shown in the payment QR's place when its logo is tapped
 * (the developer's design, Oct 30, 2026; mock-up
 * https://claude.ai/artifact/QhP6SJXjpZbVL4yhqQD8Ah). Platforms, languages,
 * who holds the funds, buy/sell, website (as text: a link would leave the
 * kiosk), a sovereignty score out of 5, and "¿Qué es esto?" to see the score
 * point by point. The open/close rules live in PaymentScreen's InvoiceQr.
 */
export function WalletCard({
  id,
  rubric,
  onToggleRubric,
  onBack,
}: {
  id: WalletId
  rubric: boolean
  onToggleRubric: () => void
  onBack: () => void
}) {
  const lang = useLang()
  const wallet = WALLETS[id]
  const info = WALLET_INFO[id]
  const score = info.points.filter(Boolean).length

  return (
    <section className="wallet-card" aria-label={t.walletDetails} data-wallet={id}>
      <div className="wallet-card__head">
        <img className="wallet-card__logo" src={`${KIOSK.assets}wallets/${wallet.logo}`} alt="" draggable={false} />
        <div className="wallet-card__title">
          <div className="wallet-card__name-row">
            <h2 className="wallet-card__name">{wallet.name}</h2>
            {info.beta && <span className="wallet-card__beta">BETA</span>}
          </div>
          <div className="wallet-card__score-row">
            <div className="wallet-card__stars" role="img" aria-label={t.walletStars(score)}>
              {[0, 1, 2, 3, 4].map((i) => (
                <svg key={i} viewBox="0 0 24 24" aria-hidden className={i < score ? "is-on" : "is-off"}>
                  <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
                </svg>
              ))}
            </div>
            <button type="button" className="wallet-card__what" onClick={onToggleRubric} aria-expanded={rubric}>
              <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 4" />
                <path d="M12 17.5h.01" />
              </svg>
              {rubric ? t.walletClose : t.walletWhat}
            </button>
          </div>
        </div>
      </div>

      {rubric ? (
        <div className="wallet-card__rubric">
          <p className="wallet-card__rubric-title">{t.sovereigntyTitle}</p>
          <ul>
            {t.sovereigntyPoints.map((text, i) => (
              <li key={i} data-ok={info.points[i]}>
                {info.points[i] ? (
                  <svg viewBox="0 0 24 24" role="img" aria-label={t.yes} className="is-yes"><path d="M4.5 12.5l5 5 10-11" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" role="img" aria-label="No" className="is-no"><path d="M6 6l12 12M18 6L6 18" /></svg>
                )}
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <dl className="wallet-card__facts">
          <div>
            <dt>{t.walletFor}</dt>
            <dd>
              {info.android && <span className="wallet-card__chip"><AndroidIcon />Android</span>}
              {info.ios && <span className="wallet-card__chip"><AppleIcon />iPhone</span>}
              {info.web && <span className="wallet-card__chip"><GlobeIcon />Web</span>}
              {info.platformNote && <span className="wallet-card__note">{info.platformNote}</span>}
            </dd>
          </div>
          <div>
            <dt>{t.walletLanguages}</dt>
            <dd>
              {info.spanish && <span className="wallet-card__chip"><span className="wallet-card__flag"><BoliviaFlag /></span>Español</span>}
              {info.english && <span className="wallet-card__chip"><span className="wallet-card__flag"><UkFlag /></span>English</span>}
            </dd>
          </div>
          <div>
            <dt>{t.walletFunds}</dt>
            <dd className="wallet-card__text">
              {info.selfCustody ? <KeyIcon /> : <BankIcon />}
              {info.custody[lang]}
            </dd>
          </div>
          <div>
            <dt>{t.walletBuySell}</dt>
            <dd className={`wallet-card__text${info.canBuy ? "" : " is-muted"}`}>
              {info.canBuy ? <CheckIcon /> : <CrossIcon />}
              {info.buy[lang]}
            </dd>
          </div>
          <div>
            <dt>{t.walletSite}</dt>
            <dd className="wallet-card__site">
              <GlobeIcon />
              {info.site}
            </dd>
          </div>
        </dl>
      )}

      <button type="button" className="wallet-card__back" onClick={onBack}>
        <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        {t.walletBack}
      </button>
    </section>
  )
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#3ddc84" aria-hidden>
      <path d="M6 10.5h12v7a1.5 1.5 0 0 1-1.5 1.5H15v2.5a1.25 1.25 0 0 1-2.5 0V19h-1v2.5a1.25 1.25 0 0 1-2.5 0V19H7.5A1.5 1.5 0 0 1 6 17.5zM4.25 10.5a1.25 1.25 0 0 1 1.25 1.25v4.5a1.25 1.25 0 0 1-2.5 0v-4.5a1.25 1.25 0 0 1 1.25-1.25zm15.5 0A1.25 1.25 0 0 1 21 11.75v4.5a1.25 1.25 0 0 1-2.5 0v-4.5a1.25 1.25 0 0 1 1.25-1.25zM6.1 9.5a6 6 0 0 1 3-4.4L8.2 3.6a.4.4 0 0 1 .7-.4l.9 1.6a6.3 6.3 0 0 1 4.4 0l.9-1.6a.4.4 0 0 1 .7.4l-.9 1.5a6 6 0 0 1 3 4.4zM9.5 7.6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm5 0a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" />
    </svg>
  )
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#f5f5f5" aria-hidden>
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#8ab4ff" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19M12 2.5c2.6 2.8 3.8 6 3.8 9.5s-1.2 6.7-3.8 9.5c-2.6-2.8-3.8-6-3.8-9.5S9.4 5.3 12 2.5z" />
    </svg>
  )
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#1fd165" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" />
    </svg>
  )
}
function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#ffb000" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 4l9 5.5M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8M3 20.5h18" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#1fd165" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )
}
function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
