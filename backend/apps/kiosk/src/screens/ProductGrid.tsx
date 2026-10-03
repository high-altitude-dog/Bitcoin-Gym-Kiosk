import type { HttpTypes } from "@medusajs/types"
import { formatBs } from "../lib/money"

interface Props {
  products: HttpTypes.StoreProduct[]
  cartItemCount: number
  onAdd: (variantId: string) => void
  onViewCart: () => void
}

export function ProductGrid({ products, cartItemCount, onAdd, onViewCart }: Props) {
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Armor Gym</h1>
      </header>

      <div className="product-grid">
        {products.map((product) => {
          const variant = product.variants?.[0]
          const stock = variant?.inventory_quantity ?? 0
          const price = variant?.calculated_price?.calculated_amount
          const image = product.images?.[0]?.url

          return (
            <button
              key={product.id}
              className="product-card"
              disabled={!variant || stock <= 0}
              onClick={() => variant && onAdd(variant.id)}
            >
              {image ? (
                <img className="product-image" src={image} alt={product.title} />
              ) : (
                <div className="product-image product-image--placeholder" />
              )}
              <div className="product-title">{product.title}</div>
              <div className="product-price">{formatBs(price)}</div>
              {stock <= 0 && <div className="product-sold-out">Sold out</div>}
            </button>
          )
        })}
      </div>

      {cartItemCount > 0 && (
        <button className="cart-fab" onClick={onViewCart}>
          View cart ({cartItemCount})
        </button>
      )}
    </div>
  )
}
