import { useEffect, useState } from "react"
import { INVOICE_TIMEOUT_MS, sdk } from "../lib/medusa"
import type { InvoiceMethod } from "../lib/payment"
import { t } from "../lib/strings"

type Service = "yadio" | "coinos" | "bark"
type StepState = "pending" | "done" | "failed"
type Light = "off" | "amber" | "green" | "red"

// Which outside services each Bitcoin method's invoice needs.
const USES: Record<InvoiceMethod, Service[]> = {
  lightning: ["yadio", "coinos"],
  ark: ["yadio", "bark"],
  bip321: ["yadio", "coinos", "bark"],
}
const LIGHTS: { service: Service; label: string }[] = [
  { service: "yadio", label: "Yadio" },
  { service: "coinos", label: "coinos.io" },
  { service: "bark", label: "Bark" },
]
const POLL_MS = 250
// A light still amber this close to the kiosk giving up turns red.
const RED_BEFORE_TIMEOUT_MS = 1_000

/**
 * UK-style traffic lights (red over amber over green) beside Byte while an
 * invoice is created, one per outside service: amber from the tap while it's
 * being fetched, green once it has arrived, red if it failed or is still
 * missing 1 s before the kiosk would give up (15 s), off if this method doesn't
 * use it. Progress comes from GET /store/invoice-progress/:token, which the
 * payment provider fills in (backend lib/invoice-progress.ts).
 */
export function InvoiceLights(props: {
  method: InvoiceMethod
  progress: { token: string; requestedAt: number | null } | null
}) {
  const steps = useInvoiceSteps(props.progress)
  const requestedAt = props.progress?.requestedAt ?? null
  const late = requestedAt !== null && Date.now() >= requestedAt + INVOICE_TIMEOUT_MS - RED_BEFORE_TIMEOUT_MS
  const used = USES[props.method]

  const lightFor = (service: Service): Light => {
    if (!used.includes(service)) return "off"
    const state = steps?.[service]?.state
    if (state === "done") return "green"
    if (state === "failed" || late) return "red"
    return "amber"
  }
  const word: Record<Light, string> = { off: t.lightOff, amber: t.lightAmber, green: t.lightGreen, red: t.lightRed }

  return (
    <ul className="invoice-lights">
      {LIGHTS.map(({ service, label }) => {
        const light = lightFor(service)
        return (
          <li key={service} className={`invoice-light invoice-light--${light}`} data-service={service} data-light={light}>
            <span className="invoice-light__housing" role="img" aria-label={`${label}: ${word[light]}`}>
              <span className="invoice-light__lamp invoice-light__lamp--red" />
              <span className="invoice-light__lamp invoice-light__lamp--amber" />
              <span className="invoice-light__lamp invoice-light__lamp--green" />
            </span>
            <span className="invoice-light__label">{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Polls the server for this request's steps every 250 ms, from when the request goes out. */
function useInvoiceSteps(progress: { token: string; requestedAt: number | null } | null) {
  const [steps, setSteps] = useState<Partial<Record<Service, { state: StepState }>> | null>(null)
  const [, tick] = useState(0)
  const token = progress?.requestedAt ? progress.token : null

  useEffect(() => {
    setSteps(null)
    if (!token) return
    let stopped = false
    let busy = false
    const poll = async () => {
      tick((n) => n + 1) // re-render, so a late light turns red on time
      if (busy) return
      busy = true
      try {
        const res = await sdk.client.fetch<{ steps: Partial<Record<Service, { state: StepState }>> }>(
          `/store/invoice-progress/${token}`
        )
        if (!stopped) setSteps(res.steps)
      } catch {
        // A network blip: keep the lights as they are.
      } finally {
        busy = false
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [token])

  return steps
}
