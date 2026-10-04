import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { SlackTemplate } from "../modules/slack-notification/messages"

type NotifySlackInput = {
  template: SlackTemplate
  data: Record<string, unknown>
  // Same key = same message: a redelivered event or a re-run job won't post
  // twice. A send that failed is retried the next time the key comes round.
  idempotencyKey: string
  triggerType: string
  resourceId?: string
  resourceType?: string
}

// Sends one alert to the kiosk's Slack channel. Never throws: an alert is
// never worth failing whatever triggered it (a sale, a scheduled job).
export async function notifySlack(container: MedusaContainer, input: NotifySlackInput): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  // The provider is only registered when this is set (see medusa-config.ts).
  if (!process.env.SLACK_WEBHOOK_URL) return

  try {
    const notifications = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to: "slack",
      channel: "slack",
      template: input.template,
      data: input.data,
      idempotency_key: input.idempotencyKey,
      trigger_type: input.triggerType,
      resource_id: input.resourceId,
      resource_type: input.resourceType,
    })
  } catch (e) {
    logger.warn(`notify-slack: "${input.template}" (${input.idempotencyKey}) was not sent: ${(e as Error).message}`)
  }
}
