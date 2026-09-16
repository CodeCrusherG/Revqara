import { attr, type CollectionDefinition } from "./_types";

/** contact_lists — named audiences a campaign can target. */
export const contactLists: CollectionDefinition = {
  id: "contact_lists",
  name: "Contact Lists",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("name", 256, { required: true }),
    attr.string("description", 2_000),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
  ],
};

export default contactLists;
