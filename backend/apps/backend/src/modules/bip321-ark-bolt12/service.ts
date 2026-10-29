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
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { CoinosClient } from "../coinos-lightning/lib/coinos-client"
import { YadioClient, sharedYadioClient } from "../coinos-lightning/lib/yadio-client"
import { BarkPayClient, PAID_STATUSES, btcAmount } from "../bark-ark/lib/bark-pay-client"
import { Bip321Options } from "./types"

type InjectedDependencies = {
  logger: Logger
}

const DEFAULT_EXPIRY_SECONDS = 600

// One BIP 321 URI with no on-chain address: `amount=` in BTC, `ark=` (bark's
// own extension parameter) and `lno=` (BIP 321's key for a BOLT12 offer).
export function bip321Uri(amountSat: number, arkAddress: string, offer: string): string {
  return `bitcoin:?amount=${btcAmount(amountSat)}&ark=${encodeURIComponent(arkAddress)}&lno=${encodeURIComponent(offer)}`
}

// "Pagar con BIP321 Ark/Bolt12" at the kiosk, a live experiment (Oct 29, 2026):
// one QR carrying an Ark address from our Bark Pay (an Ark-only charge) and a
// single-use BOLT12 offer from Coinos, for the same sats amount. Whichever is
// paid first counts. Neither side can be cancelled once the other is paid, so
// paying both is possible until they expire (overpaid, refunded by hand).
//
// No webhook route of its own: the offer's webhook goes to /hooks/coinos and
// Bark Pay's to /hooks/bark. Each of those providers checks its signature or
// secret and returns the payment session id (the offer's memo, the charge's
// reference); Medusa's processPaymentWorkflow then authorizes that session
// through its own provider, this one (authorizePaymentSessionStep by session
// id, checked in @medusajs/core-flows 2.21.2), which re-checks both.
class Bip321ProviderService extends AbstractPaymentProvider<Bip321Options> {
  static identifier = "bip321"

  protected logger_: Logger
  protected options_: Bip321Options
  protected coinos_: CoinosClient
  protected bark_: BarkPayClient
  protected yadio_: YadioClient

  constructor(container: InjectedDependencies, options: Bip321Options) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.coinos_ = new CoinosClient({ baseUrl: options.coinosApiUrl, token: options.coinosApiToken })
    this.bark_ = new BarkPayClient({ baseUrl: options.barkPayUrl, apiKey: options.barkPayApiKey })
    this.yadio_ = sharedYadioClient(options.yadioApiUrl, options.yadioCacheTtlMs)
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of [
      "coinosApiUrl",
      "coinosApiToken",
      "coinosWebhookSecret",
      "webhookBaseUrl",
      "barkPayUrl",
      "barkPayApiKey",
      "yadioApiUrl",
    ]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${key} is required in the bip321 provider's options`
        )
      }
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = String(input.data?.session_id ?? "")
    const amountBob = Number(input.amount)

    const rate = await this.yadio_.getRate()
    const satsAmount = Math.max(1, this.yadio_.satsForBob(amountBob, rate))
    const expirySeconds = this.options_.expirySeconds ?? DEFAULT_EXPIRY_SECONDS

    const [offer, charge] = await Promise.all([
      this.coinos_.createInvoice({
        amountSats: satsAmount,
        memo: sessionId,
        expirySeconds,
        webhookUrl: `${this.options_.webhookBaseUrl.replace(/\/+$/, "")}/hooks/coinos`,
        webhookSecret: this.options_.coinosWebhookSecret,
        type: "bolt12",
        singleUse: true,
      }),
      this.bark_.createCharge({
        amountSat: satsAmount,
        reference: sessionId,
        description: `Armor Gym, Bs ${amountBob} (BIP321)`,
        expiresIn: expirySeconds,
        rails: ["ark"],
        idempotencyKey: `kiosk-bip321-${sessionId}`,
      }),
    ])

    const arkAddress = charge.rails.find((r) => r.rail === "ark")?.value
    if (!arkAddress || !offer.text) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "bip321: missing Ark address or BOLT12 offer")
    }

    return {
      id: charge.id,
      data: {
        session_id: sessionId,
        coinos_invoice_id: offer.id,
        bark_charge_id: charge.id,
        payment_uri: bip321Uri(satsAmount, arkAddress, offer.text),
        ark_address: arkAddress,
        bolt12_offer: offer.text,
        bob_amount: amountBob,
        sats_amount: satsAmount,
        yadio_rate_btc_per_bob: rate.btcPerBob,
        received_sats: 0,
        paid_rail: null,
        expires_at: Date.now() + expirySeconds * 1000,
        expiry_seconds: expirySeconds,
      },
    }
  }

  // Asks both sides. Paid on either counts; with neither paid, a failed
  // lookup throws rather than reading as unpaid (Medusa tries again later).
  private async check(data: Record<string, unknown>) {
    const invoiceId = data.coinos_invoice_id as string | undefined
    const chargeId = data.bark_charge_id as string | undefined
    if (!invoiceId || !chargeId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "bip321: missing coinos_invoice_id or bark_charge_id on payment session data"
      )
    }
    const satsAmount = Number(data.sats_amount ?? 0)
    const [offer, charge] = await Promise.allSettled([
      this.coinos_.getInvoice(invoiceId),
      this.bark_.getCharge(chargeId),
    ])
    const coinos = offer.status === "fulfilled" ? offer.value : null
    const bark = charge.status === "fulfilled" ? charge.value : null

    const offerReceived = coinos?.received ?? 0
    const offerPaid = !!coinos && offerReceived >= satsAmount
    const arkPaid = !!bark && PAID_STATUSES.includes(bark.status)
    // Both paid: Ark is recorded, the offer's sats show in received_sats.
    const paidRail = arkPaid ? "ark" : offerPaid ? "bolt12" : null

    if (!paidRail && (!coinos || !bark)) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "bip321: Coinos or Bark Pay lookup failed")
    }
    if (arkPaid && offerPaid) {
      this.logger_.warn(`bip321: session ${data.session_id} paid on both Ark and BOLT12, refund one by hand`)
    }
    return {
      paid: !!paidRail,
      data: {
        ...data,
        received_sats: (bark?.amountReceivedSat ?? 0) + offerReceived,
        bark_status: bark?.status ?? data.bark_status ?? null,
        paid_rail: paidRail,
      },
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

  // Neither side is cancelled: Coinos can't cancel an offer, and the kiosk
  // reuses a live QR after "Cancelar", as for the other invoice methods.
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "bip321: refunds are not supported, pay the member back by hand from Coinos or Bark Pay"
    )
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    if (!input.data?.bark_charge_id) {
      return { data: input.data ?? {} }
    }
    return { data: (await this.check(input.data)).data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  // Never called: webhooks arrive through /hooks/coinos and /hooks/bark (see above).
  async getWebhookActionAndData(): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default Bip321ProviderService
