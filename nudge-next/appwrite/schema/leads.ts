import { attr, type CollectionDefinition } from "./_types";

/**
 * leads — a captured sales/booking enquiry from a conversation. `status` is the
 * pipeline stage: a String(48) (NOT an enum) because per-vertical packs define
 * and validate the stage set. One lead per conversation (unique conversationId).
 */
export const leads: CollectionDefinition = {
  id: "leads",
  name: "Leads",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("conversationId", 64),
    attr.string("contactId", 64),
    attr.string("name", 256),
    attr.string("phone", 32),
    attr.string("intent", 64),
    attr.string("details", 2_000),
    attr.enum("source", ["bot", "agent"], { default: "bot" }),
    attr.string("status", 48, { default: "new" }),
    attr.string("assignedToUserId", 64),
    attr.string("assignedToTeamId", 64),
    attr.boolean("needsHuman", { default: false }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "idx_workspace_status",
      type: "key",
      attributes: ["workspaceId", "status"],
    },
    {
      key: "idx_workspace_assignedUser",
      type: "key",
      attributes: ["workspaceId", "assignedToUserId"],
    },
    {
      key: "idx_workspace_assignedTeam",
      type: "key",
      attributes: ["workspaceId", "assignedToTeamId"],
    },
    {
      key: "idx_workspace_needsHuman",
      type: "key",
      attributes: ["workspaceId", "needsHuman"],
    },
    {
      key: "uq_lead_conversation",
      type: "unique",
      attributes: ["conversationId"],
    },
  ],
};

export default leads;
