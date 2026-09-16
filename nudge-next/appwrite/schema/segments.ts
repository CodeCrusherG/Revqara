import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * segments — an LLM-generated audience segment within a campaign. `customerIds`
 * is a String[] array (filterable by membership).
 */
export const segments: CollectionDefinition = {
  id: "segments",
  name: "Segments",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("campaignId", 64, { required: true }),
    attr.string("label", 256, { required: true }),
    attr.string("criteriaJson", JSON_SIZE.medium),
    attr.string("customerIds", 64, { array: true }),
    attr.string("sendTime", 32),
    attr.float("predictedOpenRate"),
    attr.float("predictedClickRate"),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_campaignId", type: "key", attributes: ["campaignId"] },
  ],
};

export default segments;
