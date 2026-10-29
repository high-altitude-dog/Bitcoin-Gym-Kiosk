import { useEffect, useRef } from "react"
import { KIOSK } from "../lib/stageConfig"
import type { PaymentStatus } from "../state/useKiosk"

const BARK_URL = `${KIOSK.assets}sounds/dog-bark.mp3`

/**
 * A dog bark when a Bitcoin payment (Lightning, Bitcoin Ark or BIP321) is
 * confirmed: once per payment, as "¡Pago recibido!" appears. Cash and bank QR
 * never reach "confirmed", so they stay quiet. The member tapped a payment
 * button earlier in the visit, so the browser allows the sound; if it is
 * blocked anyway, the payment carries on silently.
 */
export function usePaymentBark(paymentStatus: PaymentStatus) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const previous = useRef<PaymentStatus>(null)

  useEffect(() => {
    if (typeof Audio === "undefined") return
    const bark = new Audio(BARK_URL)
    bark.preload = "auto"
    audio.current = bark
    return () => {
      bark.pause()
      audio.current = null
    }
  }, [])

  useEffect(() => {
    const was = previous.current
    previous.current = paymentStatus
    if (paymentStatus !== "confirmed" || was === "confirmed") return
    const bark = audio.current
    if (!bark) return
    bark.currentTime = 0
    void bark.play().catch(() => {})
  }, [paymentStatus])
}
