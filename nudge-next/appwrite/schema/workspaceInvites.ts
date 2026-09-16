import { attr, type CollectionDefinition } from "./_types";

const ROLES = [
  "org:owner",
  "org:admin",
  "org:manager",
  "org:agent",
  "org:viewer",
];

/**
 * workspace_invites — thin mirror of Clerk Organization Invitations for an
 * in-app pending-invites list (Clerk Invitations remain primary).
 */
export const workspaceInvites: CollectionDefinition = {
  id: "workspace_invites",
  name: "Workspace Invites",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.email("email", { required: true }),
    attr.enum("role", ROLES, { default: "org:agent" }),
    attr.enum("status", ["pending", "accepted", "revoked", "expired"], {
      default: "pending",
    }),
    attr.datetime("expiresAt"),
    attr.datetime("acceptedAt"),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_email", type: "key", attributes: ["email"] },
  ],
};

export default workspaceInvites;
