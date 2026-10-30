import { useEffect, useState } from "react"
import { INVOICE_TIMEOUT_MS, sdk } from "../lib/medusa"
import type { InvoiceMethod } from "../lib/payment"
import { t } from "../lib/strings"

export type Service = "yadio" | "coinos" | "bark"
type StepState = "pending" | "done" | "failed"
export type Light = "amber" | "green" | "red"

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
// Every light starts red this long before showing its real state (the
// developer, Oct 30, 2026): a visual effect only, it says nothing about the
// service, so the lights' accessible labels already give the real state.
export const INTRO_RED_MS = 600

export type InvoiceLight = { service: Service; label: string; used: boolean; light: Light; real: Light; word: string }

/**
 * The status of each outside service while an invoice is created, as the
 * drawing room's portraits show it (DrawingRoom.tsx; until Oct 30, 2026 they
 * were UK-style traffic lights): red for the first 600 ms (an effect only),
 * then amber while it's being fetched, green once it has arrived, red if it
 * failed or is still missing 1 s before the kiosk would give up (15 s).
 * `used` is false for a service this method doesn't call (Bark for Bolt11,
 * Coinos for Ark/Bolt11). `real` and `word` give the true state, for the
 * accessible label, during the red opening. Progress comes from GET
 * /store/invoice-progress/:token, which the payment provider fills in
 * (backend lib/invoice-progress.ts).
 */
export function useInvoiceLights(
  method: InvoiceMethod,
  progress: { token: string; requestedAt: number | null; arrived?: boolean } | null
): InvoiceLight[] {
  const steps = useInvoiceSteps(progress)
  const requestedAt = progress?.requestedAt ?? null
  const late = requestedAt !== null && Date.now() >= requestedAt + INVOICE_TIMEOUT_MS - RED_BEFORE_TIMEOUT_MS
  const used = USES[method]
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), INTRO_RED_MS)
    return () => clearTimeout(timer)
  }, [])

  const lightFor = (service: Service): Light => {
    if (progress?.arrived) return "green"
    const state = steps?.[service]?.state
    if (state === "done") return "green"
    if (state === "failed" || late) return "red"
    return "amber"
  }
  const word: Record<Light, string> = { amber: t.lightAmber, green: t.lightGreen, red: t.lightRed }

  return LIGHTS.map(({ service, label }) => {
    const real = lightFor(service)
    return { service, label, used: used.includes(service), light: intro ? "red" : real, real, word: word[real] }
  })
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
