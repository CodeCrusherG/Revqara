import { attr, type CollectionDefinition } from "./_types";

/**
 * whatsapp_messages — one outbound campaign WhatsApp message + its engagement
 * lifecycle. Drives the `sends_today` meter. `tracker` == "{broadcastId}:{customerId}"
 * round-trips on read/click webhooks.
 */
export const whatsappMessages: CollectionDefinition = {
  id: "whatsapp_messages",
  name: "WhatsApp Messages",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("broadcastId", 64, { required: true }),
    attr.string("campaignId", 64),
    attr.string("customerId", 64, { required: true }),
    attr.string("waId", 32),
    attr.string("wamid", 128),
    attr.string("tracker", 160, { required: true }),
    attr.enum("status", ["sent", "delivered", "read", "failed"], {
      default: "sent",
    }),
    attr.boolean("clicked", { default: false }),
    attr.boolean("replied", { default: false }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_broadcastId", type: "key", attributes: ["broadcastId"] },
    { key: "idx_campaignId", type: "key", attributes: ["campaignId"] },
    { key: "idx_customerId", type: "key", attributes: ["customerId"] },
    { key: "idx_waId", type: "key", attributes: ["waId"] },
    { key: "idx_wamid", type: "key", attributes: ["wamid"] },
    {
      key: "idx_workspace_broadcast",
      type: "key",
      attributes: ["workspaceId", "broadcastId"],
    },
    { key: "idx_tracker", type: "key", attributes: ["tracker"] },
  ],
};

export default whatsappMessages;
