import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SlackNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [SlackNotificationProviderService],
})
