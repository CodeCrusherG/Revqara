import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * webhook_events — inbound provider event log for idempotency / dedup. Global.
 * Natural key: `$id` == sha256(provider:eventId). The createDocument 409 IS the
 * duplicate detection (atomic, race-free) — replaces the SQL unique constraint.
 */
export const webhookEvents: CollectionDefinition = {
  id: "webhook_events",
  name: "Webhook Events",
  documentSecurity: true,
  naturalKey: "sha256(provider:providerEventId)",
  attributes: [
    attr.string("workspaceId", 64), // set once routed
    attr.enum("provider", ["whatsapp_cloud", "whatsapp_sim"], {
      required: true,
    }),
    attr.string("providerEventId", 128, { required: true }),
    attr.string("messageId", 128),
    attr.string("payloadJson", JSON_SIZE.large),
    attr.enum(
      "status",
      ["received", "processing", "processed", "failed", "ignored_duplicate"],
      { default: "received" },
    ),
    attr.string("error", 2_000),
    attr.datetime("processedAt"),
  ],
  indexes: [
    {
      key: "idx_provider_event",
      type: "key",
      attributes: ["provider", "providerEventId"],
    },
    {
      key: "idx_workspace_status",
      type: "key",
      attributes: ["workspaceId", "status"],
    },
  ],
};

export default webhookEvents;
