import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CoinosLightningProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [CoinosLightningProviderService],
})
