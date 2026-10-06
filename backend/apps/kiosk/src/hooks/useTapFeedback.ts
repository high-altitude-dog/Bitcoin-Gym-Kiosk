import { useEffect } from "react"

// Long enough to see on a quick tap, which can lift in under 50 ms.
const MIN_PRESSED_MS = 120

/**
 * Instant feedback on every button: a short click sound and a pressed look,
 * both on touch-down, before the app has done anything with the tap. The
 * tablet has no vibration motor, so sound stands in for haptics. CSS :active
 * alone isn't enough: on Android it can show late, or not at all, for a
 * quick tap.
 */
export function useTapFeedback() {
  useEffect(() => {
    const click = createClick()

    const onPointerDown = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest("button")
      if (!button || button.disabled) return

      click.play()
      button.classList.add("is-pressed")
      const pressedAt = performance.now()
      const release = () => {
        button.removeEventListener("pointerup", release)
        button.removeEventListener("pointercancel", release)
        button.removeEventListener("pointerleave", release)
        const wait = Math.max(0, MIN_PRESSED_MS - (performance.now() - pressedAt))
        setTimeout(() => button.classList.remove("is-pressed"), wait)
      }
      button.addEventListener("pointerup", release)
      button.addEventListener("pointercancel", release)
      button.addEventListener("pointerleave", release)
    }

    // A touch only counts as a user gesture for audio when it lifts, so the
    // very first tap may have to unlock the sound here.
    const onPointerUp = () => click.unlock()

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true })
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true })
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true })
      document.removeEventListener("pointerup", onPointerUp, { capture: true })
      click.close()
    }
  }, [])
}

/**
 * A short "tick", synthesized with Web Audio: no sound file to download or
 * cache, so it works offline like the rest of the app shell. Silent (never an
 * error) where audio isn't available.
 */
function createClick() {
  let ctx: AudioContext | null = null

  const context = () => {
    if (!ctx && typeof AudioContext !== "undefined") {
      try {
        ctx = new AudioContext({ latencyHint: "interactive" })
      } catch {
        ctx = null
      }
    }
    return ctx
  }

  return {
    play() {
      const ac = context()
      if (!ac) return
      if (ac.state === "suspended") void ac.resume().catch(() => {})
      const now = ac.currentTime
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      // Square wave, near full volume and a little longer: about 12 dB
      // louder than the first version, which was too quiet on the tablet's
      // speaker. Its harmonics sit where small speakers are loudest.
      osc.type = "square"
      osc.frequency.setValueAtTime(1800, now)
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.04)
      gain.gain.setValueAtTime(0.8, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
      osc.connect(gain).connect(ac.destination)
      osc.start(now)
      osc.stop(now + 0.07)
    },
    unlock() {
      const ac = context()
      if (ac?.state === "suspended") void ac.resume().catch(() => {})
    },
    close() {
      void ctx?.close().catch(() => {})
      ctx = null
    },
  }
}
