import { useEffect } from "react"

// Long enough to see on a quick tap, which can lift in under 50 ms.
const MIN_PRESSED_MS = 120
// A button inside something that scrolls (the product grid, the category
// chips when they overflow, a long list) gives its feedback only once a tap is
// confirmed: the finger lifted without having moved more than TAP_SLOP_PX, and
// nothing was scrolling (a scroll within SCROLL_QUIET_MS). A swipe that starts
// on a card, a "+" or a chip must stay silent and still, or it looks and
// sounds like a tap.
const TAP_SLOP_PX = 10
const SCROLL_QUIET_MS = 250

/**
 * Instant feedback on every button: a short click sound and a pressed look,
 * both on touch-down, before the app has done anything with the tap. The
 * tablet has no vibration motor, so sound stands in for haptics. CSS :active
 * alone isn't enough: on Android it can show late, or not at all, for a
 * quick tap.
 */
/** True when the element sits inside a container that can scroll right now. */
function insideScroller(el: Element): boolean {
  if (el.closest(".k-grid")) return true
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node)
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1
    if (scrollsY || scrollsX) return true
  }
  return false
}

export function useTapFeedback() {
  useEffect(() => {
    const click = createClick()

    let lastScroll = -Infinity
    const onScroll = () => {
      lastScroll = performance.now()
    }
    const scrolling = () => performance.now() - lastScroll < SCROLL_QUIET_MS

    const flash = (button: HTMLButtonElement) => {
      click.play()
      button.classList.add("is-pressed")
      setTimeout(() => button.classList.remove("is-pressed"), MIN_PRESSED_MS)
    }

    const onPointerDown = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest("button")
      if (!button || button.disabled) return

      if (insideScroller(button)) {
        if (scrolling()) return // a touch that lands on a moving grid only stops it
        const x = event.clientX
        const y = event.clientY
        const cancel = () => button.removeEventListener("pointerup", onUp)
        const onUp = (e: PointerEvent) => {
          button.removeEventListener("pointercancel", cancel)
          if (Math.hypot(e.clientX - x, e.clientY - y) > TAP_SLOP_PX || scrolling()) return
          flash(button)
        }
        button.addEventListener("pointerup", onUp, { once: true })
        button.addEventListener("pointercancel", cancel, { once: true })
        return
      }

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

    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true })
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true })
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("pointerdown", onPointerDown, { capture: true })
      document.removeEventListener("pointerup", onPointerUp, { capture: true })
      click.close()
    }
  }, [])
}

/**
 * A short mechanical "click", synthesized with Web Audio: no sound file to
 * download or cache, so it works offline like the rest of the app shell.
 * Silent (never an error) where audio isn't available.
 *
 * Two layers, about 15 ms in all: a burst of band-passed noise (the sharp
 * "tk" of a switch) and a soft low thump underneath it (the body of the
 * button). The earlier version was a falling 1500 → 600 Hz beep, which read
 * as a "blip" and got tiresome. Pitch varies by up to ±5% per tap so repeated
 * taps sound less mechanical.
 */
export function scheduleClick(ac: BaseAudioContext, noise: AudioBuffer, now: number, pitch = 1) {
  const burst = ac.createBufferSource()
  burst.buffer = noise
  const band = ac.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = 3200 * pitch
  band.Q.value = 0.8
  const burstGain = ac.createGain()
  burstGain.gain.setValueAtTime(CLICK_NOISE_GAIN, now)
  burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012)
  burst.connect(band).connect(burstGain).connect(ac.destination)
  burst.start(now)
  burst.stop(now + 0.02)

  const thump = ac.createOscillator()
  thump.type = "sine"
  thump.frequency.setValueAtTime(200 * pitch, now)
  thump.frequency.exponentialRampToValueAtTime(90 * pitch, now + 0.014)
  const thumpGain = ac.createGain()
  thumpGain.gain.setValueAtTime(CLICK_THUMP_GAIN, now)
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016)
  thump.connect(thumpGain).connect(ac.destination)
  thump.start(now)
  thump.stop(now + 0.02)
}

const CLICK_NOISE_GAIN = 1.2
const CLICK_THUMP_GAIN = 0.55

export function makeNoise(ac: BaseAudioContext) {
  const length = Math.ceil(ac.sampleRate * 0.02)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function createClick() {
  let ctx: AudioContext | null = null
  let noise: AudioBuffer | null = null

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
      noise ??= makeNoise(ac)
      scheduleClick(ac, noise, ac.currentTime, 1 + (Math.random() * 2 - 1) * 0.05)
    },
    unlock() {
      const ac = context()
      if (ac?.state === "suspended") void ac.resume().catch(() => {})
    },
    close() {
      void ctx?.close().catch(() => {})
      ctx = null
      noise = null
    },
  }
}
