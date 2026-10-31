import { allowedLocations, locationAllowed } from "../kiosk-location"

describe("kiosk location gate", () => {
  it("is open when KIOSK_LOCATIONS isn't set", () => {
    expect(allowedLocations(undefined)).toBeNull()
    expect(allowedLocations(" , ")).toBeNull()
    expect(locationAllowed(undefined, null)).toBe(true)
  })

  it("accepts a listed location, whatever its case or spaces", () => {
    const allowed = allowedLocations("calacoto, Sopocachi")
    expect(allowed).toEqual(["calacoto", "sopocachi"])
    expect(locationAllowed("calacoto", allowed)).toBe(true)
    expect(locationAllowed(" Calacoto ", allowed)).toBe(true)
    expect(locationAllowed(["sopocachi"], allowed)).toBe(true)
  })

  it("refuses a missing or unknown location", () => {
    const allowed = allowedLocations("calacoto")
    expect(locationAllowed(undefined, allowed)).toBe(false)
    expect(locationAllowed("", allowed)).toBe(false)
    expect(locationAllowed("obrajes", allowed)).toBe(false)
    expect(locationAllowed(42, allowed)).toBe(false)
  })
})
