import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/**
 * customer_profiles — a per-campaign-run materialisation of a targeted contact,
 * enriched with demographics + LLM-assigned segment tags (String[] array).
 */
export const customerProfiles: CollectionDefinition = {
  id: "customer_profiles",
  name: "Customer Profiles",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("customerId", 64, { required: true }),
    attr.email("email"),
    attr.string("fullName", 256),
    attr.string("whatsappNumber", 32),
    attr.integer("age"),
    attr.string("gender", 32),
    attr.string("maritalStatus", 32),
    attr.integer("familySize"),
    attr.integer("dependentCount"),
    attr.integer("kidsInHousehold"),
    attr.string("city", 128),
    attr.string("occupation", 128),
    attr.string("occupationType", 64),
    attr.integer("monthlyIncome"),
    attr.integer("creditScore"),
    attr.string("kycStatus", 16),
    attr.string("appInstalled", 16),
    attr.string("existingCustomer", 16),
    attr.string("socialMediaActive", 16),
    attr.string("rawDataJson", JSON_SIZE.large),
    attr.string("segmentTags", 64, { array: true }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_customerId", type: "key", attributes: ["customerId"] },
    { key: "idx_segmentTags", type: "key", attributes: ["segmentTags"] },
  ],
};

export default customerProfiles;
