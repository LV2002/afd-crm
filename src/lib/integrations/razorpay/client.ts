import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RazorpayError";
  }
}

export interface CreatedPaymentLink {
  id: string;
  shortUrl: string;
}

/**
 * Creates a Razorpay payment link. The amount is in paise, an integer —
 * money is never a float here. Razorpay's own SMS/email notices are switched
 * off: the link is delivered in the WhatsApp chat instead, once, by us.
 * `referenceId` is our row id, so a webhook can always be matched back.
 */
export async function createPaymentLink(
  credentials: { keyId: string; keySecret: string },
  input: {
    amountPaise: number;
    description: string;
    referenceId: string;
    customerName: string;
    customerPhone: string;
    /** Unix seconds; Razorpay requires at least 15 minutes ahead. */
    expireBy?: number;
  },
): Promise<CreatedPaymentLink> {
  const response = await fetch(`${API}/payment_links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      description: input.description,
      reference_id: input.referenceId,
      customer: { name: input.customerName, contact: input.customerPhone },
      notify: { sms: false, email: false },
      reminder_enable: false,
      ...(input.expireBy ? { expire_by: input.expireBy } : {}),
    }),
  });
  const body = (await response.json()) as { id?: string; short_url?: string; error?: { description?: string } };
  if (!response.ok || !body.id || !body.short_url) {
    throw new RazorpayError(body.error?.description ?? `Razorpay returned ${response.status}`, response.status);
  }
  return { id: body.id, shortUrl: body.short_url };
}

/** Razorpay signs the raw body with HMAC-SHA256 using the webhook secret. Constant-time comparison. */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PaymentLinkEvent {
  event: string;
  linkId: string | null;
  referenceId: string | null;
  paymentId: string | null;
}

/** Pulls what matters out of a webhook body; null when it is not a payment-link event. */
export function parsePaymentLinkEvent(raw: unknown): PaymentLinkEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { event?: unknown; payload?: { payment_link?: { entity?: { id?: string; reference_id?: string } }; payment?: { entity?: { id?: string } } } };
  if (typeof body.event !== "string" || !body.event.startsWith("payment_link.")) return null;
  const link = body.payload?.payment_link?.entity;
  return {
    event: body.event,
    linkId: link?.id ?? null,
    referenceId: link?.reference_id ?? null,
    paymentId: body.payload?.payment?.entity?.id ?? null,
  };
}

/** payment_link.paid → paid; cancelled and expired are their own states; anything else changes nothing. */
export function statusForEvent(event: string): "paid" | "expired" | "cancelled" | null {
  if (event === "payment_link.paid") return "paid";
  if (event === "payment_link.expired") return "expired";
  if (event === "payment_link.cancelled") return "cancelled";
  return null;
}
