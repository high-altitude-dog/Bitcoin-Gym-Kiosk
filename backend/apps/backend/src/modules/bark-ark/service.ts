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
import { YadioClient, sharedYadioClient } from "../coinos-lightning/lib/yadio-client"
import { BarkCharge, BarkPayClient, PAID_STATUSES, paymentUri } from "./lib/bark-pay-client"
import { verifyBarkSignature } from "./lib/webhook-signature"
import { BarkArkOptions } from "./types"
import { formatTimings, InvoiceService, progressToken, startProgress, track } from "../../lib/invoice-progress"

type InjectedDependencies = {
  logger: Logger
}

const DEFAULT_CHARGE_EXPIRY_SECONDS = 600

function isPaid(charge: BarkCharge): boolean {
  return PAID_STATUSES.includes(charge.status)
}

// "Bitcoin Ark" at the kiosk: a charge on our self-hosted Bark Pay
// (bark.paywithbitcoin.lol) offering an Ark address and a Lightning invoice,
// shown as one BIP 321 QR. Either way the sats land in Bark Pay's barkd wallet.
// Like Coinos Lightning, a payment is final once Bark Pay reports it, so a paid
// charge goes straight from pending to captured.
class BarkArkProviderService extends AbstractPaymentProvider<BarkArkOptions> {
  static identifier = "bark-ark"

  protected logger_: Logger
  protected options_: BarkArkOptions
  protected bark_: BarkPayClient
  protected yadio_: YadioClient

  constructor(container: InjectedDependencies, options: BarkArkOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.bark_ = new BarkPayClient({ baseUrl: options.barkPayUrl, apiKey: options.barkPayApiKey })
    this.yadio_ = sharedYadioClient(options.yadioApiUrl, options.yadioCacheTtlMs)
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of ["barkPayUrl", "barkPayApiKey", "webhookSecret", "yadioApiUrl"]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${key} is required in the bark-ark provider's options`
        )
      }
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // Medusa merges the payment session id into input.data; it goes to Bark
    // Pay as the charge's `reference`, which comes back on every webhook.
    const sessionId = String(input.data?.session_id ?? "")
    const amountBob = Number(input.amount)

    // Each outside service's step is recorded for the kiosk's traffic lights
    // (lib/invoice-progress.ts) and timed for the log.
    const token = progressToken(input.data)
    const timings: Partial<Record<InvoiceService, number | string>> = {}
    const started = Date.now()
    startProgress(token, ["yadio", "bark"])
    const expirySeconds = this.options_.chargeExpirySeconds ?? DEFAULT_CHARGE_EXPIRY_SECONDS

    let rate: Awaited<ReturnType<YadioClient["getRate"]>>
    let satsAmount: number
    let charge: BarkCharge
    try {
      rate = await track(token, "yadio", timings, () => this.yadio_.getRate())
      satsAmount = Math.max(1, this.yadio_.satsForBob(amountBob, rate))
      charge = await track(token, "bark", timings, () =>
        this.bark_.createCharge({
          amountSat: satsAmount,
          reference: sessionId,
          description: `Armor Gym, Bs ${amountBob}`,
          expiresIn: expirySeconds,
          rails: ["ark", "lightning"],
          // One charge per payment session, even if Medusa retries the call.
          idempotencyKey: `kiosk-${sessionId}`,
        })
      )
    } catch (error) {
      this.logger_.warn(`bark-ark: charge for ${sessionId} failed after ${Date.now() - started} ms (${formatTimings(timings)})`)
      throw error
    }
    this.logger_.info(`bark-ark: charge for ${sessionId} in ${Date.now() - started} ms (${formatTimings(timings)})`)

    return {
      id: charge.id,
      data: {
        session_id: sessionId,
        bark_charge_id: charge.id,
        // Bark Pay's own figure: what it will count as paid.
        payment_uri: paymentUri(charge.rails, charge.amountSat),
        ark_address: charge.rails.find((r) => r.rail === "ark")?.value ?? null,
        bolt11: charge.rails.find((r) => r.rail === "lightning")?.value ?? null,
        bob_amount: amountBob,
        sats_amount: satsAmount,
        yadio_rate_btc_per_bob: rate.btcPerBob,
        received_sats: 0,
        expires_at: Date.now() + expirySeconds * 1000,
        // The kiosk counts down from this on its own clock (see coinos-lightning).
        expiry_seconds: expirySeconds,
      },
    }
  }

  private async check(data: Record<string, unknown>) {
    const chargeId = data.bark_charge_id as string | undefined
    if (!chargeId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "bark-ark: missing bark_charge_id on payment session data"
      )
    }
    const charge = await this.bark_.getCharge(chargeId)
    const won = charge.rails.find((r) => r.status === "won")?.rail ?? null
    return {
      paid: isPaid(charge),
      data: { ...data, received_sats: charge.amountReceivedSat, bark_status: charge.status, paid_rail: won },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const { paid, data } = await this.check(input.data ?? {})
    return { status: paid ? "captured" : "pending_authorization", data }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    if (!input.data?.bark_charge_id) {
      return { status: "pending" }
    }
    const { paid, data } = await this.check(input.data)
    return { status: paid ? "captured" : "pending", data }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  // Not cancelled at Bark Pay: a cancelled charge still records a late
  // payment, so cancelling wouldn't stop the money arriving, and the kiosk
  // reuses a live charge after "Cancelar" the same way it does for Coinos.
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "bark-ark: refunds are not supported, pay the member back from the Bark Pay wallet"
    )
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    if (!input.data?.bark_charge_id) {
      return { data: input.data ?? {} }
    }
    return { data: (await this.check(input.data)).data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // The amount is fixed in sats when the charge is created.
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const headers = (payload.headers ?? {}) as Record<string, unknown>
    const raw = payload.rawData
    const rawBody = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : ""

    if (!verifyBarkSignature(headers["bark-signature"], rawBody, this.options_.webhookSecret)) {
      this.logger_.warn("bark-ark: webhook with a bad or missing Bark-Signature, ignoring")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const event = (payload.data ?? {}) as { type?: string; data?: { object?: Partial<BarkCharge> } }
    const charge = event.data?.object
    const sessionId = typeof charge?.reference === "string" ? charge.reference : ""
    if (
      !sessionId ||
      (event.type !== "charge.paid" && event.type !== "charge.overpaid") ||
      !charge?.status ||
      !PAID_STATUSES.includes(charge.status)
    ) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    // A trigger only: Medusa then calls authorizePayment, which asks Bark Pay
    // for the charge again before anything is marked paid. No `amount`, for
    // the same reason as coinos-lightning: it would be read as Bs.
    return {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessionId } as WebhookActionResult["data"],
    }
  }
}

export default BarkArkProviderService
