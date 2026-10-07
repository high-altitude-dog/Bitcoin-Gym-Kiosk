import Medusa from "@medusajs/js-sdk"

// Every request gives up after this long. The SDK's fetch has no timeout of
// its own, so a reply lost on the gym wifi would otherwise leave it waiting
// forever, and with it every cart change queued behind it and the payment
// poll (which skips ticks while one is in flight).
export const REQUEST_TIMEOUT_MS = 10_000

export const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_MEDUSA_BACKEND_URL,
  publishableKey: import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY,
})

// Every sdk.store.* call goes through client.fetch, which passes its options
// on to fetch() as they are, so a default abort signal here covers them all.
const clientFetch = sdk.client.fetch.bind(sdk.client)
sdk.client.fetch = ((input, init) =>
  clientFetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })) as typeof sdk.client.fetch

// Medusa answered with an error status (out of stock, invalid cart, ...), as
// opposed to a timeout or no connection, where the request may or may not
// have reached it.
export function isHttpError(err: unknown): boolean {
  return typeof (err as { status?: unknown } | null)?.status === "number"
}
