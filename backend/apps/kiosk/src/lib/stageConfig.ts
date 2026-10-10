/** Stage/visual settings for the kiosk's dark "Kiosko Byte, La Paz" design. */
const ASSETS = `${import.meta.env.BASE_URL ?? "/"}kiosk/`

export type Orientation = "portrait" | "landscape"

const wall = (name: string) => ({ x1: `${ASSETS}${name}.webp`, x2: `${ASSETS}${name}@2x.webp` })

export const KIOSK = {
  assets: ASSETS,
  // One wall image per screen and orientation. Both orientations are
  // preloaded, so turning the tablet never shows a bare background.
  wall: {
    portrait: { idle: wall("wall-idle"), shop: wall("wall-shop") },
    landscape: { idle: wall("wall-idle-landscape"), shop: wall("wall-shop-landscape") },
  },
  // The fixed design stage for each way up. The screen is scaled to fit.
  stage: {
    portrait: { width: 1200, height: 1920 },
    landscape: { width: 1920, height: 1200 },
  },
  locale: "es-BO",
} as const
