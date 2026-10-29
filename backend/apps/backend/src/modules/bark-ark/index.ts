import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import BarkArkProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [BarkArkProviderService],
})
