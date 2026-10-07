# Café asociado: spec (in progress)

Items made by a partner sandwich and coffee shop about 100 m from Armor Gym, sold on the kiosk and delivered to the gym. This file collects what's decided and what's still open. Nothing in "Open" is built yet.

## Decided

- **Name:** the partner is called "Café asociado" everywhere staff see it (admin, Slack).
- **Which items:** products whose Type is "Café asociado" in the admin. Built and live since Oct 7, 2026, along with "Autoservicio" (auto-fulfilled) and "Entrega del personal".
- **Order notification:** the café's part of each order goes to its own private Slack channel (`#cafe-test` for now, `SLACK_CAFE_WEBHOOK_URL`), without prices or admin links. Built and live.
- **Fulfilment status:** café items stay "Not fulfilled" until someone marks them delivered; the rest of the order is fulfilled automatically, so a mixed order shows as partially fulfilled meanwhile. Built and live.
- **Slack access:** café staff join the gym's workspace as regular members; every channel is private, and they are only added to the café channel.
- **Pickup markers:** three wooden markers at the gym, numbered 1–3. Each order containing café items gets the next marker in a cycle (1, 2, 3, 1, …) that counts café orders only. The café leaves the delivery next to that marker. Usually no more than three orders wait at once.
- **Café updates its own availability:** the café needs a way to say what it can sell, from its own premises (not through the Medusa admin, whose permissions can't be limited to the café's products).

## Proposed, not yet confirmed

- **Where the marker shows:** in the café's Slack message ("Dejar junto al marcador 2 · pedido #14"), on the member's done screen ("Tu pedido del café llegará al marcador 2"), and on the order in the admin.
- **Marker still taken:** if the cycle reaches a marker whose previous café order isn't marked delivered yet, warn in the café and staff channels.
- **Assigning the marker:** at order creation (Medusa's order-completion hook), so the done screen can show it; concurrent orders can't get the same marker (lock).
- **Availability page:** a small phone page for the café, in Spanish, listing only its products with a Disponible/Agotado switch and an optional count; stored as stock at a "Café asociado" stock location, so the kiosk's existing "Agotado" handling applies.

## Open

- **Availability page scope:** availability only, or also adding items and changing prices?
- **Café sign-in:** a private bookmarked link, or a username and password?
- **Who marks café items delivered:** gym staff in the admin, the café (e.g. a button in Slack or on its page), or the member?
- **Opening hours:** hide café items on the kiosk outside the café's hours? Fixed hours, or the café switches itself on and off?
- **Delivery time:** should the member see an estimate ("aprox. 15 min")?
- **Payment to the café:** how and how often the gym pays the café for its items (affects what the café needs to see: a daily summary?).
- **Cancellations and problems:** what happens if the café can't make an item after it's been paid for (refund path, who tells the member)?
- **Pricing:** who sets the kiosk price of café items, and is there a gym margin?
