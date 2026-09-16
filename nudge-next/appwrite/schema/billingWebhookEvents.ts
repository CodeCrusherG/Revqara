import { attr, type CollectionDefinition } from "./_types";

/**
 * billing_webhook_events — Razorpay webhook idempotency / dedup (§6). Natural
 * key: `$id` == Razorpay eventId. The create 409 is the dedup signal
 * (claimEvent); releaseEvent (delete) on processing failure so retries re-run.
 */
export const billingWebhookEvents: CollectionDefinition = {
  id: "billing_webhook_events",
  name: "Billing Webhook Events",
  documentSecurity: true,
  naturalKey: "Razorpay eventId",
  attributes: [
    attr.string("type", 128),
    attr.datetime("processedAt"),
    attr.string("payloadHash", 128),
  ],
  indexes: [],
};

export default billingWebhookEvents;
