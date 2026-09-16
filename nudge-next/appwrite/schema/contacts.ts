import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * contacts — a real WhatsApp subscriber in a workspace's CRM. Demographic
 * columns are flat; arbitrary CSV columns land in attributesJson. `tags` is a
 * String[] array (filterable by membership). WhatsApp consent gates marketing.
 * Unique (workspaceId,whatsappNumber) [= uq_workspace_whatsapp].
 */
export const contacts: CollectionDefinition = {
  id: "contacts",
  name: "Contacts",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("fullName", 256),
    attr.string("whatsappNumber", 32, { required: true }),
    attr.email("email"),
    attr.integer("age"),
    attr.string("gender", 32),
    attr.string("city", 128),
    attr.string("occupationType", 64),
    attr.integer("monthlyIncome"),
    attr.integer("creditScore"),
    attr.string("kycStatus", 16),
    attr.string("appInstalled", 16),
    attr.string("existingCustomer", 16),
    attr.string("socialMediaActive", 16),
    attr.string("attributesJson", JSON_SIZE.medium),
    attr.string("tags", 64, { array: true }),
    attr.enum("optInStatus", ["opted_in", "opted_out", "unknown"], {
      default: "unknown",
    }),
    attr.string("optInSource", 32),
    attr.datetime("optInAt"),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    {
      key: "uq_workspace_whatsapp",
      type: "unique",
      attributes: ["workspaceId", "whatsappNumber"],
    },
    {
      key: "idx_workspace_optInStatus",
      type: "key",
      attributes: ["workspaceId", "optInStatus"],
    },
    { key: "idx_tags", type: "key", attributes: ["tags"] },
  ],
};

export default contacts;
