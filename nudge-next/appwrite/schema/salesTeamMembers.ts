import { attr, type CollectionDefinition } from "./_types";

/** sales_team_members — membership of a sales team. */
export const salesTeamMembers: CollectionDefinition = {
  id: "sales_team_members",
  name: "Sales Team Members",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("teamId", 64, { required: true }),
    attr.string("userId", 64, { required: true }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_teamId", type: "key", attributes: ["teamId"] },
    { key: "idx_userId", type: "key", attributes: ["userId"] },
    {
      key: "uq_sales_team_member",
      type: "unique",
      attributes: ["teamId", "userId"],
    },
  ],
};

export default salesTeamMembers;
