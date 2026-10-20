// The gym's static bank QR (the BCP card on the front desk), until the
// Baneco API gives a QR per order. Decoded from a photo of the card on Oct 20,
// 2026. Static: it carries no amount, so the member types the total into their
// bank app. Rendered with exactly the card's settings (version 13, error
// correction L, mask 4, one byte segment): every one of its 69x69 modules
// matches the printed card.
export const BANK_QR_PAYLOAD = "d/NDLjZNoq8CgYdwha6R+W/8NRzFax4CTz+zSVRBHfOkNwQsf5c4bEk9EjReYCwWVpc1NLlvtqkjQEqcAeVYgwB1luuIlOQFxxsMmQARfja0Dm167WRYe6pqCl19a5ZO20UBAsfxO1tUB3AFRE9Ro8ztd5kPBfLklU1lT7HDYDEkaXEjdKqZKYEyQu/xIlie0sowS6HvNH1PXX6Lq1rLoB5kruhH9XBvB+nl44PRDYCm4rSegeOAfo4GNuZTid5i/wB1WN5bDSZDAFlAn9T4svXY3mI3/4N9EqJrcmqs6/Dpi6SNCiiJxWTdbN/1k5Qvs+nhgV6D5ZncqDnsYtlqZw==|0FABBA22E4072538599B68591360A676"

export const BANK_QR_OPTIONS = {
  version: 13,
  errorCorrectionLevel: "L",
  maskPattern: 4,
} as const
