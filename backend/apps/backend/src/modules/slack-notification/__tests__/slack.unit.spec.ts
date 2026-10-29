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
  staffOrderMessage,
  cafeOrderMessage,
  unpaidCashMessage,
  cashAutoPaidMessage,
  cashCollectMessage,
  cashCollectCancelledMessage,
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
    expect(text).toContain("pagó con Bitcoin (Lightning, Ark o BIP321)")
    const withRail = paidWithoutOrderMessage({ cart_id: "cart_abc", amount: 1, sats: 103, minutes_waiting: 4, rail: "Ark (Bark Pay, botón BIP321)" })
    expect(withRail).toContain("El cliente pagó con Bitcoin por *Ark (Bark Pay, botón BIP321)*, pero el pedido no se completó.")
  })

  it("lists both kinds of reconciliation mismatch, capped at 10 lines each", () => {
    const unmatched = Array.from({ length: 12 }, (_, i) => ({ memo: `payses_${i}`, amount: 100 }))
    const text = reconciliationMismatchMessage({
      date: "2026-10-03",
      unmatched_coinos: unmatched,
      captured_without_coinos: ["pay_1"],
    })
    expect(text).toContain("12 pago(s) recibido(s) en coinos.io sin pedido")
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

describe("staff and café hand-over messages", () => {
  const data = { display_id: 21, items: [{ title: "Sándwich <jamón>", quantity: 2 }], admin_url: "http://b.test/app/orders/o1" }

  it("tells staff what to hand over, with an admin link", () => {
    const text = staffOrderMessage(data)
    expect(text).toContain("*Pedido #21 para entregar*")
    expect(text).toContain("• 2 × Sándwich &lt;jamón&gt;")
    expect(text).toContain("<http://b.test/app/orders/o1|Ver pedido en el admin>")
  })

  it("tells the café what to deliver, without prices or admin link", () => {
    const text = cafeOrderMessage(data)
    expect(text).toContain("*Nuevo pedido #21* del kiosko de Armor Gym")
    expect(text).toContain("número de pedido #21")
    expect(text).not.toContain("http")
    expect(text).not.toContain("Bs")
  })
})

describe("slack provider routing", () => {
  const sent: { url: string; text: string }[] = []
  beforeEach(() => {
    sent.length = 0
    global.fetch = jest.fn(async (url: any, init: any) => {
      sent.push({ url: String(url), text: JSON.parse(init.body).text })
      return { ok: true, text: async () => "ok" } as any
    }) as any
  })
  const logger = { warn: jest.fn() } as any
  const msg = (to: string) => ({ to, channel: "slack", template: "staff-order", data: { display_id: 1, items: [] } }) as any

  it("sends staff and café messages to their own webhooks when set", async () => {
    const p = new SlackNotificationProviderService({ logger }, { webhook_url: "K", staff_webhook_url: "S", cafe_webhook_url: "C" })
    await p.send(msg("staff"))
    await p.send(msg("cafe"))
    await p.send(msg("kiosk"))
    await p.send(msg("slack")) // records from before destinations existed
    expect(sent.map((s) => s.url)).toEqual(["S", "C", "K", "K"])
    expect(sent[0].text.startsWith("*Pedido")).toBe(true)
  })

  it("falls back to the kiosk channel, marked, when a channel isn't configured", async () => {
    const p = new SlackNotificationProviderService({ logger }, { webhook_url: "K" })
    await p.send(msg("staff"))
    await p.send(msg("cafe"))
    expect(sent.map((s) => s.url)).toEqual(["K", "K"])
    expect(sent[0].text).toContain("para el personal")
    expect(sent[1].text).toContain("para el Café asociado")
  })

  it("marks a cash sale as still to be collected", () => {
    const text = orderPlacedMessage({ display_id: 7, total: 3, items: [{ title: "Banana", quantity: 3 }], payment_method: "cash" })
    expect(text.split("\n")[0]).toBe("*Venta #7* · Bs 3 · efectivo, *por cobrar en recepción*")
  })

  it("names a BIP321 sale and which half of the QR was paid", () => {
    const line = (paid_rail: string | null) =>
      orderPlacedMessage({ display_id: 8, total: 1, items: [{ title: "Banana", quantity: 1 }], payment_method: "bip321", sats: 103, paid_rail }).split("\n")[0]
    expect(line("bolt12")).toBe("*Venta #8* · Bs 1 · BIP321 Ark/Bolt12 (103 sats, pagado por Bolt12)")
    expect(line("ark")).toBe("*Venta #8* · Bs 1 · BIP321 Ark/Bolt12 (103 sats, pagado por Ark)")
    expect(line(null)).toBe("*Venta #8* · Bs 1 · BIP321 Ark/Bolt12 (103 sats)")
  })

  it("tells staff to capture or cancel an unpaid cash order", () => {
    const text = unpaidCashMessage({ display_id: 7, total: 3, minutes_waiting: 20, admin_url: "http://backend.test/app/orders/order_7" })
    expect(text).toContain("*Pedido #7 en efectivo sin cobrar* desde hace 20 min · Bs 3")
    expect(text).toContain("capturar el pago en el admin")
    expect(text).toContain("<http://backend.test/app/orders/order_7|Ver pedido en el admin>")
    expect(renderSlackMessage("unpaid-cash", { display_id: 7, total: 3, minutes_waiting: 20 })).toContain("#7")
  })

  it("tells staff a cash order was recorded as paid after 5 minutes with no tap", () => {
    const text = cashAutoPaidMessage({ display_id: 8, total: 2, admin_url: "http://backend.test/app/orders/order_8" })
    expect(text).toContain("*Pedido #8 en efectivo dado por pagado* · Bs 2")
    expect(text).toContain("Verificar que el dinero esté en caja")
    expect(renderSlackMessage("cash-auto-paid", { display_id: 8, total: 2 })).toContain("#8")
  })

  it("tells the desk how much cash to collect, and when not to", () => {
    const text = cashCollectMessage({ total: 4, items: [{ title: "Banana", quantity: 2 }] })
    expect(text).toBe("*Cobrar Bs 4 en efectivo* (kiosko)\n• 2 × Banana")
    expect(cashCollectCancelledMessage({ total: 4, items: [] })).toBe("Cancelado: *no cobrar Bs 4* (kiosko)")
    expect(renderSlackMessage("cash-collect-cancelled", { total: 4, items: [] })).toContain("no cobrar")
  })
})
