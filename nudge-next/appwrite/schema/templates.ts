import { attr, type CollectionDefinition } from "./_types";

/**
 * templates — a pre-approved WhatsApp message template (required for
 * business-initiated messages outside the 24-hour service window).
 * Unique (workspaceId,name) [= uq_template_workspace_name].
 */
export const templates: CollectionDefinition = {
  id: "templates",
  name: "Templates",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("name", 256, { required: true }),
    attr.enum(
      "category",
      ["marketing", "utility", "authentication", "service"],
      { default: "marketing" },
    ),
    attr.string("language", 16, { default: "en" }),
    attr.string("body", 8_192, { required: true }),
    attr.enum("status", ["draft", "pending", "approved", "rejected"], {
      default: "draft",
    }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "uq_template_workspace_name",
      type: "unique",
      attributes: ["workspaceId", "name"],
    },
  ],
};

export default templates;
