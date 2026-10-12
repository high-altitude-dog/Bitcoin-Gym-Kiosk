import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CashPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [CashPaymentProviderService],
})
