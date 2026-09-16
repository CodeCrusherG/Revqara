import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * sync_runs — a reconciliation job run (status / consistency / analytics).
 * Provider-agnostic. Global (workspaceId optional for full-platform runs).
 */
export const syncRuns: CollectionDefinition = {
  id: "sync_runs",
  name: "Sync Runs",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.enum(
      "syncType",
      ["message_status", "contacts", "campaigns", "full_workspace"],
      { required: true },
    ),
    attr.string("cursorJson", JSON_SIZE.medium),
    attr.enum("status", ["running", "success", "failed"], {
      default: "running",
    }),
    attr.string("statsJson", JSON_SIZE.medium),
    attr.datetime("startedAt"),
    attr.datetime("completedAt"),
    attr.string("error", 2_000),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "idx_workspace_type_created",
      type: "key",
      attributes: ["workspaceId", "syncType", "$createdAt"],
      orders: ["ASC", "ASC", "DESC"],
    },
  ],
};

export default syncRuns;
