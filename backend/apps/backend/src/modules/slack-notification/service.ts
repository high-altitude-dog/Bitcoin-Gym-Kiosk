import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { renderSlackMessage } from "./messages"

type SlackOptions = {
  webhook_url: string
  // Prefixed to every message, e.g. "[prueba] " outside production, so
  // test runs from a dev machine are obvious in the real channel.
  label?: string
}

// Posts kiosk alerts to one Slack channel through an incoming webhook.
// Medusa's Notification Module records every send with its status, and
// skips a repeat of an idempotency key that already succeeded, so callers
// get a log of what was sent and no duplicates when an event is redelivered.
class SlackNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "slack"

  protected logger_: Logger
  protected options_: SlackOptions

  constructor({ logger }: { logger: Logger }, options: SlackOptions) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.webhook_url) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "webhook_url is required in the slack notification provider's options")
    }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const text = (this.options_.label ?? "") + renderSlackMessage(notification.template, notification.data ?? {})
    const res = await fetch(this.options_.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      // Never include the webhook URL: it's a secret and this ends up in logs.
      const body = await res.text().catch(() => "")
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Slack webhook rejected the "${notification.template}" message: ${res.status} ${body}`
      )
    }
    return {}
  }
}

export default SlackNotificationProviderService
