// Live progress of an invoice being created, per outside service, for the
// kiosk's traffic lights on Byte's loading screen (Oct 30, 2026). The kiosk
// sends a random `progress_token` in the payment session's data; the payment
// provider records each service's step under it here, and
// GET /store/invoice-progress/:token reads it back. In memory: one Medusa
// process on the VM, and an entry only matters for the ~15 s the kiosk waits.

export type InvoiceService = "yadio" | "coinos" | "bark"
export type StepState = "pending" | "done" | "failed"
export type Step = { state: StepState; ms?: number }
export type InvoiceProgress = Partial<Record<InvoiceService, Step>>

const KEEP_MS = 5 * 60_000
const MAX_ENTRIES = 500
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

const entries = new Map<string, { at: number; steps: InvoiceProgress }>()

/** The token from a payment session's data, if it's a well-formed one. */
export function progressToken(data: Record<string, unknown> | undefined | null): string | null {
  const token = data?.progress_token
  return typeof token === "string" && TOKEN.test(token) ? token : null
}

function prune(now: number) {
  for (const [token, entry] of entries) if (now - entry.at > KEEP_MS) entries.delete(token)
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string)
}

function set(token: string | null, service: InvoiceService, step: Step) {
  if (!token) return
  const now = Date.now()
  const entry = entries.get(token) ?? { at: now, steps: {} }
  entry.steps[service] = step
  entries.set(token, entry)
  prune(now)
}

/** Marks every service the method uses as pending at once, so all their lights start amber. */
export function startProgress(token: string | null, services: InvoiceService[]) {
  for (const service of services) set(token, service, { state: "pending" })
}

/**
 * Runs one service's step, recording it as pending, then done or failed with
 * how long it took. `timings` collects the milliseconds for the provider's log
 * line. Errors are re-thrown unchanged.
 */
export async function track<T>(
  token: string | null,
  service: InvoiceService,
  timings: Partial<Record<InvoiceService, number | string>>,
  step: () => Promise<T>
): Promise<T> {
  const started = Date.now()
  set(token, service, { state: "pending" })
  try {
    const result = await step()
    const ms = Date.now() - started
    timings[service] = ms
    set(token, service, { state: "done", ms })
    return result
  } catch (error) {
    const ms = Date.now() - started
    timings[service] = `${ms} (failed)`
    set(token, service, { state: "failed", ms })
    throw error
  }
}

/** The steps recorded under a token, or null if there are none (unknown or expired). */
export function readProgress(token: string): InvoiceProgress | null {
  return entries.get(token)?.steps ?? null
}

/** "yadio 3 ms, coinos 950 ms, bark 120 ms": the per-service timing line for the log. */
export function formatTimings(timings: Partial<Record<InvoiceService, number | string>>): string {
  return (Object.keys(timings) as InvoiceService[]).map((s) => `${s} ${timings[s]} ms`).join(", ")
}

/** For tests. */
export function clearProgress() {
  entries.clear()
}
