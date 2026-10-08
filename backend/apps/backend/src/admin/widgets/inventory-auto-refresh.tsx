import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

// The admin loads the Inventory list once, so sales from the kiosk and stock
// changes made elsewhere only show after a manual refresh. This widget has no
// visible output: while the Inventory page is open and the tab is visible, it
// marks the list's data stale every few seconds, which makes the dashboard
// refetch it in place (no page reload, filters and paging are kept).
const REFRESH_MS = 10_000

const InventoryAutoRefresh = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["inventory_items"] })
      }
    }
    const timer = setInterval(refresh, REFRESH_MS)
    // Catch up at once when the tab comes back to the front.
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [queryClient])

  return null
}

export const config = defineWidgetConfig({
  zone: "inventory_item.list.before",
})

export default InventoryAutoRefresh
