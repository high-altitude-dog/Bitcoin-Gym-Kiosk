import SlackNotificationProviderService from "../service"
import {
  escapeSlack,
  formatBs,
  formatSats,
  lowStockMessage,
  orderPlacedMessage,
  paidWithoutOrderMessage,
  reconciliationMismatchMessage,
  renderSlackMessage,
} from "../messages"

describe("slack messages (Spanish)", () => {
  it("formats Bs and sats the Bolivian way", () => {
    expect(formatBs(14)).toBe("Bs 14")
    expect(formatBs(12.5)).toBe("Bs 12,50")
    expect(formatSats(1987)).toBe("1.987 sats")
  })

  it("describes a Lightning sale with items, sats and an admin link", () => {
    const text = orderPlacedMessage({
      display_id: 12,
      total: 14,
      items: [
        { title: "Whey Protein Concentrate - Chocolate", quantity: 1 },
        { title: "Banana", quantity: 2 },
      ],
      payment_method: "lightning",
      sats: 1987,
      admin_url: "http://backend.test/app/orders/order_1",
    })
    expect(text).toBe(
      [
        "*Venta #12* · Bs 14 · Lightning (1.987 sats)",
        "• 1 × Whey Protein Concentrate - Chocolate",
        "• 2 × Banana",
        "<http://backend.test/app/orders/order_1|Ver pedido en el admin>",
      ].join("\n")
    )
  })

  it("says agotado for zero and the count otherwise", () => {
    const text = lowStockMessage({
      display_id: 12,
      items: [
        { title: "Banana", available: 2 },
        { title: "Creatine Monohydrate", available: 0 },
      ],
    })
    expect(text).toContain("• Banana: quedan 2")
    expect(text).toContain("• Creatine Monohydrate: *agotado*")
  })

  it("gives staff the same cart reference the kiosk shows", () => {
    const text = paidWithoutOrderMessage({ cart_id: "cart_abc", amount: 10, sats: 1430, minutes_waiting: 4 })
    expect(text).toContain("hace 4 min · Bs 10 (1.430 sats)")
    expect(text).toContain("`cart_abc`")
  })

  it("lists both kinds of reconciliation mismatch, capped at 10 lines each", () => {
    const unmatched = Array.from({ length: 12 }, (_, i) => ({ memo: `payses_${i}`, amount: 100 }))
    const text = reconciliationMismatchMessage({
      date: "2026-10-03",
      unmatched_coinos: unmatched,
      captured_without_coinos: ["pay_1"],
    })
    expect(text).toContain("12 pago(s) recibido(s) en Coinos sin pedido")
    expect(text).toContain("• y 2 más")
    expect(text).toContain("• `pay_1`")
  })

  it("escapes Slack control characters in product names", () => {
    expect(escapeSlack("Barra <proteína> & avena")).toBe("Barra &lt;proteína&gt; &amp; avena")
  })

  it("rejects an unknown template instead of posting something empty", () => {
    expect(() => renderSlackMessage("nope", {})).toThrow('unknown template "nope"')
  })
})

describe("SlackNotificationProviderService", () => {
  const webhook = "https://hooks.slack.com/services/T000/B000/SECRET123"
  let fetchMock: jest.Mock
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }

  beforeEach(() => {
    fetchMock = jest.fn()
    ;(global as any).fetch = fetchMock
  })

  const notification = {
    to: "slack",
    channel: "slack",
    template: "paid-without-order",
    data: { cart_id: "cart_abc", amount: 10, sats: null, minutes_waiting: 3 },
  }

  it("posts the rendered message, with the label, to the webhook", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "ok" })
    const service = new SlackNotificationProviderService({ logger } as any, { webhook_url: webhook, label: "[prueba] " })

    await service.send(notification as any)

    expect(fetchMock).toHaveBeenCalledWith(webhook, expect.objectContaining({ method: "POST" }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text.startsWith("[prueba] *Pago confirmado sin pedido*")).toBe(true)
  })

  it("throws on a Slack error so Medusa records the send as failed, without leaking the URL", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "no_service" })
    const service = new SlackNotificationProviderService({ logger } as any, { webhook_url: webhook })

    const error = await service.send(notification as any).catch((e) => e)
    expect(error.message).toContain("404 no_service")
    expect(error.message).not.toContain("SECRET123")
  })

  it("refuses to start without a webhook URL", () => {
    expect(() => SlackNotificationProviderService.validateOptions({})).toThrow("webhook_url is required")
  })
})
