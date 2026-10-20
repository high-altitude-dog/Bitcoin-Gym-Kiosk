import { useEffect, useState } from "react"
import { t } from "../lib/strings"

// "¡Buenos días!" until noon, "¡Buenas tardes!" until 7 pm, "¡Buenas noches!"
// from 7 pm (and before 5 am). Uses the tablet's own clock, which is set to
// Bolivian time, and re-checks every minute so it changes on its own.
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return t.greetingMorning
  if (hour >= 12 && hour < 19) return t.greetingAfternoon
  return t.greetingEvening
}

// Keeps the hour, not the text, so a language change shows at once.
export function useGreeting(): string {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return greetingFor(hour)
}
