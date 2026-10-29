import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import Bip321ProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [Bip321ProviderService],
})
