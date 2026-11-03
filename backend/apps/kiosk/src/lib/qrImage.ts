import QRCode from "qrcode"

/**
 * A QR code as an SVG image URL. Built as text, never on a canvas: Tor
 * Browser (and Firefox's resist-fingerprinting mode) scrambles pixels read
 * back from a canvas, which turned the QR from `QRCode.toDataURL` into coloured
 * noise there (Nov 3, 2026).
 */
export async function qrImageUrl(
  data: Parameters<typeof QRCode.toString>[0],
  options: Omit<NonNullable<Parameters<typeof QRCode.toString>[1]>, "type">
): Promise<string> {
  const svg = await QRCode.toString(data, { ...options, type: "svg" })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
