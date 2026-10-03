import { useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"

interface Props {
  cart: HttpTypes.StoreCart
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function PaymentScreen({ cart, onConfirm, onCancel }: Props) {
  const [paying, setPaying] = useState(false)

  const handleConfirm = async () => {
    setPaying(true)
    await onConfirm()
    setPaying(false)
  }

  return (
    <div className="screen screen--center">
      <h1>Pay {formatBs(cart.total)}</h1>
      <p className="payment-note">
        Payment is still mocked while the Lightning provider is wired up.
      </p>
      <button className="primary-button" disabled={paying} onClick={handleConfirm}>
        {paying ? "Confirming..." : "Simulate payment"}
      </button>
      <button className="back-button" disabled={paying} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
