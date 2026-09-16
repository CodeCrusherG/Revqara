import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * ai_traces — per-message audit log of what the AI graph decided. Honest by
 * construction: deterministic fallbacks store confidence=NULL with
 * confidenceSource="deterministic" rather than a fabricated number.
 * `confidence` is a nullable Float (no default → not required).
 */
export const aiTraces: CollectionDefinition = {
  id: "ai_traces",
  name: "AI Traces",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("contactId", 64),
    attr.string("leadId", 64),
    attr.string("conversationId", 64),
    attr.string("inboundMessageId", 64),
    attr.string("vertical", 64),
    attr.string("intent", 64),
    attr.float("confidence"), // nullable — NULL when not honestly available
    attr.enum("confidenceSource", ["llm", "deterministic", "rule", "unknown"]),
    attr.string("extractedFieldsJson", JSON_SIZE.medium),
    attr.string("stageBefore", 48),
    attr.string("stageAfter", 48),
    attr.string("tagsAdded", 64, { array: true }),
    attr.string("nextAction", 64),
    attr.boolean("handoffRequired", { default: false }),
    attr.string("handoffReason", 256),
    attr.boolean("fallbackUsed", { default: false }),
    attr.string("modelUsed", 128),
    attr.string("graphVersion", 16),
    attr.string("error", 2_000),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "idx_workspace_created",
      type: "key",
      attributes: ["workspaceId", "$createdAt"],
      orders: ["ASC", "DESC"],
    },
    { key: "idx_conversationId", type: "key", attributes: ["conversationId"] },
  ],
};

export default aiTraces;
