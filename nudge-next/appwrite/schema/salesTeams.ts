import { attr, type CollectionDefinition } from "./_types";

/** sales_teams — named groups of agents leads can be routed to. */
export const salesTeams: CollectionDefinition = {
  id: "sales_teams",
  name: "Sales Teams",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("name", 256, { required: true }),
    attr.string("description", 2_000),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "uq_sales_team_name",
      type: "unique",
      attributes: ["workspaceId", "name"],
    },
  ],
};

export default salesTeams;
