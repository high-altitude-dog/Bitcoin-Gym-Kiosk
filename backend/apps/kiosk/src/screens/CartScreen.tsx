import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"

interface Props {
  cart: HttpTypes.StoreCart
  error: string | null
  onQuantityChange: (lineItemId: string, quantity: number) => void
  onBack: () => void
  onPayWithLightning: () => void
  onPayWithBankQr: () => void
}

export function CartScreen({
  cart,
  error,
  onQuantityChange,
  onBack,
  onPayWithLightning,
  onPayWithBankQr,
}: Props) {
  const items = cart.items ?? []

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-button" onClick={onBack}>
          Back
        </button>
        <h1>Your cart</h1>
      </header>

      {items.length === 0 ? (
        <p className="empty-cart">Your cart is empty.</p>
      ) : (
        <ul className="cart-list">
          {items.map((item) => (
            <li key={item.id} className="cart-row">
              <div className="cart-row-title">{item.title}</div>
              <div className="cart-row-controls">
                <button
                  className="stepper-button"
                  onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                >
                  -
                </button>
                <span className="cart-row-quantity">{item.quantity}</span>
                <button
                  className="stepper-button"
                  onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                >
                  +
                </button>
              </div>
              <div className="cart-row-total">
                {formatBs(item.unit_price * item.quantity)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="cart-summary">
        <span>Total</span>
        <span>{formatBs(cart.total)}</span>
      </div>

      {error && <p className="cart-error">{error}</p>}

      <div className="pay-button-row">
        <button
          className="primary-button"
          disabled={items.length === 0}
          onClick={onPayWithLightning}
        >
          Pay with Lightning
        </button>
        <button
          className="primary-button secondary-button"
          disabled={items.length === 0}
          onClick={onPayWithBankQr}
        >
          Pay with bank QR
        </button>
      </div>
    </div>
  )
}
