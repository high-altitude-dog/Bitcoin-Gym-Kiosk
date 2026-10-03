import { t } from "../lib/strings"
import type { KioskCategory } from "../lib/kioskTypes"

export function CategoryChips(props: {
  categories: KioskCategory[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const all = [{ id: null as string | null, name: t.all }, ...props.categories]
  return (
    <nav className="k-chips">
      {all.map((c) => (
        <button
          key={c.id ?? "all"}
          className="k-chip"
          aria-pressed={props.value === c.id}
          onClick={() => props.onChange(c.id)}
        >
          {c.name}
        </button>
      ))}
    </nav>
  )
}
