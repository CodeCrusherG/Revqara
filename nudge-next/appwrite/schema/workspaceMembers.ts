import { attr, type CollectionDefinition } from "./_types";

const ROLES = [
  "org:owner",
  "org:admin",
  "org:manager",
  "org:agent",
  "org:viewer",
];

/**
 * workspace_members — mirror of Clerk org membership (role + status) for joins.
 * Unique (workspaceId,userId) [= uq_workspace_member].
 */
export const workspaceMembers: CollectionDefinition = {
  id: "workspace_members",
  name: "Workspace Members",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("userId", 64, { required: true }),
    attr.email("email"),
    attr.enum("role", ROLES, { default: "org:agent" }),
    attr.enum("status", ["active", "disabled"], { default: "active" }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_userId", type: "key", attributes: ["userId"] },
    {
      key: "uq_workspace_member",
      type: "unique",
      attributes: ["workspaceId", "userId"],
    },
    {
      key: "idx_workspace_role",
      type: "key",
      attributes: ["workspaceId", "role"],
    },
  ],
};

export default workspaceMembers;
