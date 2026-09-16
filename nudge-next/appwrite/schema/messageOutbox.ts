import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * message_outbox — durable outbound send queue (transactional outbox pattern).
 * Natural key: `$id` == sha256(workspaceId:idempotencyKey) — the create 409 is
 * the uq_outbox_idem guarantee (the same reply is never enqueued twice).
 */
export const messageOutbox: CollectionDefinition = {
  id: "message_outbox",
  name: "Message Outbox",
  documentSecurity: true,
  naturalKey: "sha256(workspaceId:idempotencyKey)",
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("contactId", 64),
    attr.string("conversationId", 64),
    attr.string("inboxMessageId", 64),
    attr.enum("channel", ["whatsapp"], { default: "whatsapp" }),
    attr.string("payloadJson", JSON_SIZE.medium, { required: true }), // {to,text,sender}
    attr.string("idempotencyKey", 256, { required: true }),
    attr.enum("status", ["pending", "sending", "sent", "failed", "dead"], {
      default: "pending",
    }),
    attr.integer("attempts", { default: 0, min: 0 }),
    attr.integer("maxAttempts", { default: 5, min: 0 }),
    attr.datetime("nextAttemptAt"),
    attr.string("providerMessageId", 128),
    attr.string("lastError", 2_000),
    attr.datetime("sentAt"),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_conversationId", type: "key", attributes: ["conversationId"] },
    {
      key: "idx_status_nextAttempt", // worker claim
      type: "key",
      attributes: ["status", "nextAttemptAt"],
    },
    {
      key: "idx_workspace_idem",
      type: "key",
      attributes: ["workspaceId", "idempotencyKey"],
    },
  ],
};

export default messageOutbox;
