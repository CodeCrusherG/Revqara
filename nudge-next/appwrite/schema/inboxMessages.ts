import { attr, type CollectionDefinition } from "./_types";

/** inbox_messages — one message in a conversation (inbound or outbound). */
export const inboxMessages: CollectionDefinition = {
  id: "inbox_messages",
  name: "Inbox Messages",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("conversationId", 64, { required: true }),
    attr.enum("direction", ["inbound", "outbound"], { required: true }),
    attr.enum("sender", ["customer", "bot", "agent"], { required: true }),
    attr.string("text", 16_384),
    attr.string("wamid", 128),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_conversationId", type: "key", attributes: ["conversationId"] },
    {
      key: "idx_conversation_created",
      type: "key",
      attributes: ["conversationId", "$createdAt"],
    },
    { key: "idx_wamid", type: "key", attributes: ["wamid"] },
  ],
};

export default inboxMessages;
