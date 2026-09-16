import { attr, type CollectionDefinition } from "./_types";

/**
 * workspaces — the tenant / account. Global (not workspace-scoped to itself).
 * Natural key: `$id` == Clerk org id (`org_…`).
 */
export const workspaces: CollectionDefinition = {
  id: "workspaces",
  name: "Workspaces",
  documentSecurity: true,
  naturalKey: "org id (org_…)",
  attributes: [
    attr.string("name", 256, { required: true }),
    attr.enum("plan", ["free", "starter", "growth", "ai_pro", "agency"], {
      default: "free",
    }),
    attr.enum(
      "planStatus",
      ["none", "trialing", "active", "past_due", "cancelled", "halted"],
      { default: "none" },
    ),
    attr.string("vertical", 64, { default: "custom" }),
    attr.string("appwriteTeamId", 64),
    attr.string("rzpCustomerId", 64),
    attr.string("rzpSubscriptionId", 64),
    attr.datetime("currentPeriodEnd"),
    attr.email("billingEmail"),
  ],
  indexes: [
    { key: "idx_plan", type: "key", attributes: ["plan"] },
    { key: "idx_planStatus", type: "key", attributes: ["planStatus"] },
    {
      key: "idx_rzpSubscriptionId",
      type: "key",
      attributes: ["rzpSubscriptionId"],
    },
  ],
};

export default workspaces;
