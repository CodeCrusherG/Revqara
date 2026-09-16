import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * campaigns — an agentic campaign run. `status` is the 11-value CampaignStatus
 * enum. `stateCheckpointJson` (serialised graph state) is sized generously
 * (1M); very large states may need a Storage object + ref.
 */
export const campaigns: CollectionDefinition = {
  id: "campaigns",
  name: "Campaigns",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("name", 256),
    attr.string("brief", 16_384, { required: true }),
    attr.string("targetListId", 64),
    attr.string("templateId", 64),
    attr.datetime("scheduledAt"),
    attr.enum(
      "status",
      [
        "profiling",
        "planning",
        "generating",
        "pending_approval",
        "approved",
        "executing",
        "monitoring",
        "optimizing",
        "completed",
        "rejected",
        "scheduled",
      ],
      { default: "profiling" },
    ),
    attr.string("stateCheckpointJson", JSON_SIZE.xlarge),
    attr.string("rejectionFeedback", 4_000),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "idx_workspace_status",
      type: "key",
      attributes: ["workspaceId", "status"],
    },
  ],
};

export default campaigns;
