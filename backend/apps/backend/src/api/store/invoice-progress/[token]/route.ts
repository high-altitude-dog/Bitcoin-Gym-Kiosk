import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readProgress } from "../../../../lib/invoice-progress"

// The kiosk's traffic lights on Byte's loading screen: how far each outside
// service (Yadio, Coinos, Bark Pay) has got with the invoice the kiosk is
// waiting for, under the random token it sent with that request
// (lib/invoice-progress.ts). Only step states and timings. A token with
// nothing recorded (not yet: the kiosk starts asking as its request goes out,
// before the provider runs; or unknown, or expired) gets empty steps, not a
// 404, so the kiosk's console stays clean.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const steps = readProgress(String(req.params.token ?? "")) ?? {}
  res.set("Cache-Control", "no-store").json({ steps })
}
