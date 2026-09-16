import { attr, type CollectionDefinition } from "./_types";

/**
 * lead_assignments — append-only audit trail of who a lead was assigned to and
 * when. The Lead row carries the current assignee (denormalized) for fast
 * filtering; this table keeps the history.
 */
export const leadAssignments: CollectionDefinition = {
  id: "lead_assignments",
  name: "Lead Assignments",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("leadId", 64, { required: true }),
    attr.string("assignedToUserId", 64),
    attr.string("assignedToTeamId", 64),
    attr.string("assignedByUserId", 64),
    attr.enum("status", ["active", "reassigned", "closed"], {
      default: "active",
    }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_leadId", type: "key", attributes: ["leadId"] },
    {
      key: "idx_assignedToUserId",
      type: "key",
      attributes: ["assignedToUserId"],
    },
    {
      key: "idx_assignedToTeamId",
      type: "key",
      attributes: ["assignedToTeamId"],
    },
    {
      key: "idx_workspace_lead_status",
      type: "key",
      attributes: ["workspaceId", "leadId", "status"],
    },
  ],
};

export default leadAssignments;
