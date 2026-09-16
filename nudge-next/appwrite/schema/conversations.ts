import { attr, type CollectionDefinition } from "./_types";

/**
 * conversations — a 1:1 thread between a tenant's number and one customer.
 * Unique (workspaceId,phoneNumberId,customerWaId) [= uq_conversation].
 */
export const conversations: CollectionDefinition = {
  id: "conversations",
  name: "Conversations",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("phoneNumberId", 64, { required: true }),
    attr.string("customerWaId", 32, { required: true }),
    attr.string("customerName", 256),
    attr.string("contactId", 64),
    attr.enum("status", ["open", "closed"], { default: "open" }),
    attr.boolean("autoReply", { default: true }),
    attr.boolean("unread", { default: true }),
    attr.datetime("lastInboundAt"),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_contactId", type: "key", attributes: ["contactId"] },
    {
      key: "uq_conversation",
      type: "unique",
      attributes: ["workspaceId", "phoneNumberId", "customerWaId"],
    },
    {
      key: "idx_workspace_status_lastInbound",
      type: "key",
      attributes: ["workspaceId", "status", "lastInboundAt"],
      orders: ["ASC", "ASC", "DESC"],
    },
  ],
};

export default conversations;
