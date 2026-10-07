# Café asociado: spec (in progress)

Items made by a partner sandwich and coffee shop about 100 m from Armor Gym, sold on the kiosk and delivered to the gym. This file collects what's decided and what's still open. Nothing in "Open" is built yet.

## Decided

- **Name:** the partner is called "Café asociado" everywhere staff see it (admin, Slack).
- **Which items:** products whose Type is "Café asociado" in the admin. Built and live since Oct 7, 2026, along with "Autoservicio" (auto-fulfilled) and "Entrega del personal".
- **Order notification:** the café's part of each order goes to its own private Slack channel (`#cafe-test` for now, `SLACK_CAFE_WEBHOOK_URL`), without prices or admin links. Built and live.
- **Fulfilment status:** café items stay "Not fulfilled" until someone marks them delivered; the rest of the order is fulfilled automatically, so a mixed order shows as partially fulfilled meanwhile. Built and live.
- **Slack access:** café staff join the gym's workspace as regular members; every channel is private, and they are only added to the café channel.
- **Pickup markers:** three wooden markers at the gym, numbered 1–3. Each order containing café items gets the next marker in a cycle (1, 2, 3, 1, …) that counts café orders only. The café leaves the delivery next to that marker. Usually no more than three orders wait at once.
- **Ordering flow (decided Oct 7, 2026):** the café confirms *before* the member pays, so a cancellation never needs a refund (a Lightning refund needs an invoice from an anonymous member who may have left; a bank QR refund is a manual transfer).
  1. The member taps Pagar on a cart that contains café items.
  2. The café's Slack channel gets "¿Puedes preparar esto?" with the items and buttons **3, 4, 5, 6, 7, 8, 9, 10 min** and a red **Cancelar**. Tapping a time accepts the order and sets the estimate in one tap.
  3. Meanwhile the kiosk shows Byte's **magic hoops** animation (`byte-magic-hoops`, transparent version, from the byte-kit). The idle reset is paused.
  4. Accepted: the kiosk shows "El café lo tiene listo en ~N min" and continues to payment (the Lightning invoice is created only now, so the rate is fresh and its 10 minutes start after the wait).
  5. Paid: the order is created, gets the next marker, and the café gets a second message that needs no tap: "**Pagado** – preparar y dejar junto al **marcador N**". Only paid orders use a marker.
  6. Cancelled by the café, or **no answer within about 2 minutes**: the kiosk says the café can't take the order right now; the member can buy the rest without the café items, or go back. On a timeout the café's message changes to "Sin respuesta – pedido no realizado".
  7. Delivered: the café taps **Entregado** on the paid message. That marks the café items delivered in Medusa and frees the marker; gym staff don't need the admin for it.
- **Slack interactivity:** the buttons need a Slack app with Interactivity enabled, pointing at the backend, and a signing secret in `.env` so the backend can check each tap really came from Slack.
- **Opening hours (decided Oct 7, 2026):** set hours plus a manual switch. Default hours **Tuesday to Saturday, 08:00–17:00 La Paz time** (`America/La_Paz`, UTC−4, no daylight saving); closed Sunday and Monday. Outside them, café items can't be ordered on the kiosk. The café can also close early ("Cerrar por hoy", reopening automatically at the next opening time).
- **Café updates its own availability:** the café needs a way to say what it can sell, from its own premises (not through the Medusa admin, whose permissions can't be limited to the café's products).

## Proposed, not yet confirmed

- **Where the marker shows:** in the café's "Pagado" message, on the member's done screen ("Tu pedido del café llegará al marcador 2 en ~6 min"), and on the order in the admin.
- **Marker still taken:** if the cycle reaches a marker whose previous café order isn't marked delivered yet, warn in the café and staff channels.
- **Assigning the marker:** at order creation (Medusa's order-completion hook, to be confirmed in 2.21.2), so the done screen can show it; concurrent orders can't get the same marker (lock).
- **Café controls in Slack (recommended, replaces the phone page):** a control panel pinned in the café's channel and kept up to date by the backend: open/closed state with the hours, "Cerrar por hoy" / "Abrir", and per item **Agotado / Disponible** plus **Cantidad…** (a count that goes down with each sale and switches the item to Agotado at 0). Shows who changed what and when. Updates itself at opening and closing time. Needs a Slack bot token (to edit the panel and the order messages, e.g. "Aceptado · 6 min · Ana", "Entregado ✓"), Interactivity and the signing secret. Slack membership is the café's sign-in. Availability is stored as stock at a "Café asociado" stock location, so the kiosk's existing "Agotado" handling applies.
- *Alternative, if Slack isn't used for this:* a small phone page for the café with the same switches, signed in by private link or password.
- **Café closed on the kiosk:** show café items greyed out with "Café cerrado · abre el martes a las 8:00" (suggested, so members learn the café and its hours) rather than hiding them.

## Open

- **Changing the hours:** can the café change its default hours from the Slack panel ("Horario…"), or only the gym?
- **Adding items and prices:** stay with the gym in the admin, or can the café do it too?
- **Payment to the café:** how and how often the gym pays the café for its items (affects what the café needs to see: a daily summary?).
- **Problems after payment:** the café accepted and the member paid, but something still goes wrong (spilled coffee, never delivered). Who handles it, and is there a "problem" button? Rare now that the café confirms first.
- **Animation file:** the byte-kit's `byte-magic-hoops-transparent.gif` is needed (not on this machine yet).
- **Pricing:** who sets the kiosk price of café items, and is there a gym margin?
