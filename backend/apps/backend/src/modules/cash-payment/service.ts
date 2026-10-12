import crypto from "crypto"
import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
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
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

// Cash paid at the front desk. The kiosk places the order with the payment
// only authorized ("por cobrar"); staff take the money and click Capture on
// the order in the admin. Nothing moves money, so this is Medusa's system
// provider under its own id: cash orders can then be told apart from the
// bank QR stand-in (pp_system_default) in the admin, in Slack and in jobs.
class CashPaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "cash"

  // Public: the abstract class's constructor is protected, which ModuleProvider rejects.
  constructor(container: Record<string, unknown>, options: Record<string, never>) {
    super(container, options)
  }

  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return { id: crypto.randomUUID(), data: {} }
  }

  // Never "captured" here: capture is staff confirming they have the cash.
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { data: input.data ?? {}, status: PaymentSessionStatus.AUTHORIZED }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: { ...(input.data ?? {}), captured_at: new Date().toISOString() } }
  }

  async getPaymentStatus(_input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  // Cash handed back at the desk; the admin records it.
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getWebhookActionAndData(_payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default CashPaymentProviderService
