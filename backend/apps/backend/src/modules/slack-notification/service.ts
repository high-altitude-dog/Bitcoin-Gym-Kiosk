import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { renderSlackMessage } from "./messages"

type SlackOptions = {
  webhook_url: string // the kiosk's alert channel
  staff_webhook_url?: string
  cafe_webhook_url?: string
  // Prefixed to every message, e.g. "[prueba] " outside production, so
  // test runs from a dev machine are obvious in the real channel.
  label?: string
}

// Posts kiosk alerts to Slack through incoming webhooks, one per channel,
// chosen by the notification's `to` (see SlackDestination).
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

  // Staff and café messages go to the kiosk channel, marked as such, until
  // their own webhook is set, so nothing is lost while a channel is missing.
  protected route_(to: string): { url: string; note: string } {
    if (to === "staff") {
      return this.options_.staff_webhook_url
        ? { url: this.options_.staff_webhook_url, note: "" }
        : { url: this.options_.webhook_url, note: "_(para el personal; canal propio sin configurar)_ " }
    }
    if (to === "cafe") {
      return this.options_.cafe_webhook_url
        ? { url: this.options_.cafe_webhook_url, note: "" }
        : { url: this.options_.webhook_url, note: "_(para el Café asociado; su canal no está configurado)_ " }
    }
    return { url: this.options_.webhook_url, note: "" }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const { url, note } = this.route_(notification.to)
    const text = (this.options_.label ?? "") + note + renderSlackMessage(notification.template, notification.data ?? {})
    const res = await fetch(url, {
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
