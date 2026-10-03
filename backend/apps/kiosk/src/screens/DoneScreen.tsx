import type { HttpTypes } from "@medusajs/types"

interface Props {
  order: HttpTypes.StoreOrder
  onNewOrder: () => void
}

export function DoneScreen({ order, onNewOrder }: Props) {
  return (
    <div className="screen screen--center">
      <h1>Thank you!</h1>
      <p className="done-order">Order #{order.display_id}</p>
      <button className="primary-button" onClick={onNewOrder}>
        New order
      </button>
    </div>
  )
}
