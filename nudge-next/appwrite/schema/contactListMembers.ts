import { attr, type CollectionDefinition } from "./_types";

/**
 * contact_list_members — membership of a contact in a list. workspaceId added
 * for tenant scoping (not in the original FK-only model). Unique
 * (listId,contactId) [= uq_list_contact].
 */
export const contactListMembers: CollectionDefinition = {
  id: "contact_list_members",
  name: "Contact List Members",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("listId", 64, { required: true }),
    attr.string("contactId", 64, { required: true }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_listId", type: "key", attributes: ["listId"] },
    { key: "idx_contactId", type: "key", attributes: ["contactId"] },
    {
      key: "uq_list_contact",
      type: "unique",
      attributes: ["listId", "contactId"],
    },
  ],
};

export default contactListMembers;
