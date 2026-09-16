import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/** agent_logs — every LLM call in a campaign run writes a row. */
export const agentLogs: CollectionDefinition = {
  id: "agent_logs",
  name: "Agent Logs",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("campaignId", 64, { required: true }),
    attr.string("agentName", 128, { required: true }),
    attr.integer("step"),
    attr.string("inputPayloadJson", JSON_SIZE.large),
    attr.string("outputPayloadJson", JSON_SIZE.large),
    attr.string("llmReasoning", JSON_SIZE.medium),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_campaignId", type: "key", attributes: ["campaignId"] },
  ],
};

export default agentLogs;
