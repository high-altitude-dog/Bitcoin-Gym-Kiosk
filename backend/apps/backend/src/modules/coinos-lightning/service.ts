import { createHash, timingSafeEqual } from "crypto"
import { AbstractPaymentProvider, MedusaError, PaymentActions } from "@medusajs/framework/utils"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { CoinosClient } from "./lib/coinos-client"
import { YadioClient, sharedYadioClient } from "./lib/yadio-client"
import { CoinosLightningOptions } from "./types"

// Constant-time comparison. Hashing first gives both sides the same length,
// which timingSafeEqual requires, without revealing the secret's length.
function secretMatches(received: unknown, expected: string): boolean {
  if (typeof received !== "string") {
    return false
  }
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(received), digest(expected))
}

type InjectedDependencies = {
  logger: Logger
}

const DEFAULT_INVOICE_EXPIRY_SECONDS = 600

// A Coinos Lightning invoice, confirmed final and irreversible the moment
// Coinos reports it received (see CLAUDE.md: "A payment is final as soon as
// Coinos confirms it"). There is no separate capture step after authorization
// the way there is for a card, so a fully paid invoice goes straight from
// "pending" to "captured".
class CoinosLightningProviderService extends AbstractPaymentProvider<CoinosLightningOptions> {
  static identifier = "coinos-lightning"

  protected logger_: Logger
  protected options_: CoinosLightningOptions
  protected coinos_: CoinosClient
  protected yadio_: YadioClient

  constructor(container: InjectedDependencies, options: CoinosLightningOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.coinos_ = new CoinosClient({
      baseUrl: options.coinosApiUrl,
      token: options.coinosApiToken,
    })
    this.yadio_ = sharedYadioClient(options.yadioApiUrl, options.yadioCacheTtlMs)
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of ["coinosApiUrl", "coinosApiToken", "yadioApiUrl", "webhookSecret", "webhookBaseUrl"]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${key} is required in the coinos-lightning provider's options`
        )
      }
    }
  }

  private webhookUrl(): string {
    return `${this.options_.webhookBaseUrl.replace(/\/+$/, "")}/hooks/coinos`
  }

  // Exposed for a store route that tells the kiosk whether to show Lightning
  // at all, separately from actually creating an invoice.
  async isLightningAvailable(): Promise<boolean> {
    return this.yadio_.isAvailable()
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // Medusa creates the PaymentSession row before calling this method and
    // merges its id into input.data as session_id — this is what lets the
    // webhook (which only gets back whatever we put in Coinos's `memo` field)
    // find its way back to the right cart.
    const sessionId = String(input.data?.session_id ?? "")
    const amountBob = Number(input.amount)

    const rate = await this.yadio_.getRate()
    const satsAmount = this.yadio_.satsForBob(amountBob, rate)
    const expirySeconds = this.options_.invoiceExpirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS

    const invoice = await this.coinos_.createInvoice({
      amountSats: satsAmount,
      memo: sessionId,
      expirySeconds,
      webhookUrl: this.webhookUrl(),
      webhookSecret: this.options_.webhookSecret,
    })

    return {
      id: invoice.id,
      data: {
        session_id: sessionId,
        coinos_invoice_id: invoice.id,
        bolt11: invoice.text,
        payment_hash: invoice.paymentHash ?? null,
        bob_amount: amountBob,
        sats_amount: satsAmount,
        yadio_rate_btc_per_bob: rate.btcPerBob,
        received_sats: 0,
        // Computed here rather than trusted from Coinos's own `expiry`/`created`
        // fields, whose exact units/format are unconfirmed (see coinos-client.ts).
        expires_at: Date.now() + expirySeconds * 1000,
        // The kiosk counts down from this on its own clock: comparing its
        // clock to the server's expires_at goes wrong whenever they drift.
        expiry_seconds: expirySeconds,
      },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = input.data ?? {}
    const invoiceId = data.coinos_invoice_id as string | undefined
    const satsAmount = Number(data.sats_amount ?? 0)

    if (!invoiceId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "coinos-lightning: missing coinos_invoice_id on payment session data"
      )
    }

    const invoice = await this.coinos_.getInvoice(invoiceId)
    const receivedSats = invoice?.received ?? 0

    if (receivedSats >= satsAmount) {
      return { status: "captured", data: { ...data, received_sats: receivedSats } }
    }

    // The member hasn't paid the invoice yet. The cart still completes into
    // an order awaiting payment; the Coinos webhook (or the reconciliation
    // job as a backup) authorizes it for real once payment is confirmed.
    return { status: "pending_authorization", data: { ...data, received_sats: receivedSats } }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = input.data ?? {}
    const invoiceId = data.coinos_invoice_id as string | undefined
    const satsAmount = Number(data.sats_amount ?? 0)
    if (!invoiceId) {
      return { status: "pending" }
    }

    const invoice = await this.coinos_.getInvoice(invoiceId)
    const receivedSats = invoice?.received ?? 0

    if (receivedSats >= satsAmount) {
      return { status: "captured", data: { ...data, received_sats: receivedSats } }
    }
    return { status: "pending", data: { ...data, received_sats: receivedSats } }
  }

  // Coinos settlement is instant and final on receipt, so there is nothing
  // left to do by the time Medusa's capture step runs — it only runs right
  // after authorizePayment/the webhook reported "captured" already.
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // Coinos is Lightning-only with no refund API; a refund has to be a new
    // manual payment to the member, outside Medusa.
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "coinos-lightning: refunds are not supported, pay the member back manually"
    )
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const data = input.data ?? {}
    const invoiceId = data.coinos_invoice_id as string | undefined
    if (!invoiceId) {
      return { data }
    }
    const invoice = await this.coinos_.getInvoice(invoiceId)
    return { data: { ...data, received_sats: invoice?.received ?? 0 } }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // The cart total is fixed in sats the moment the invoice is created;
    // Coinos has no endpoint to change an existing invoice's amount.
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const body = (payload.data ?? {}) as Record<string, unknown>

    if (!secretMatches(body.secret, this.options_.webhookSecret)) {
      this.logger_.warn("coinos-lightning: webhook received with an invalid or missing secret, ignoring")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    // We put the Medusa payment session id in the invoice's memo when we
    // created it; Coinos echoes memo back on the webhook call.
    const sessionId = typeof body.memo === "string" ? body.memo : ""
    if (!sessionId || body.confirmed !== true) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    // No `amount`: Coinos reports it in sats, but Medusa uses this value as
    // the capture amount in the payment's currency (Bs) and records it on the
    // order. Left out, Medusa captures the full authorized amount, which is
    // what a Lightning invoice always is (paid in full or not at all).
    return {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessionId } as WebhookActionResult["data"],
    }
  }
}

export default CoinosLightningProviderService
