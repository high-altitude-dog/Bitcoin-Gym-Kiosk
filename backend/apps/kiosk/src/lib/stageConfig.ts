/** Stage/visual settings for the kiosk's dark "Kiosko Byte, La Paz" design. */
const ASSETS = `${import.meta.env.BASE_URL ?? "/"}kiosk/`

export const KIOSK = {
  assets: ASSETS,
  wall: {
    idle: { x1: `${ASSETS}wall-idle.webp`, x2: `${ASSETS}wall-idle@2x.webp` },
    shop: { x1: `${ASSETS}wall-shop.webp`, x2: `${ASSETS}wall-shop@2x.webp` },
  },
  stage: { width: 1200, height: 1920 },
  locale: "es-BO",
} as const
