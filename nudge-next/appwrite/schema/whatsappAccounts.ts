import { attr, type CollectionDefinition } from "./_types";

/**
 * whatsapp_accounts — a connected WhatsApp number (the tenant's own WABA).
 * Global. Natural key: `$id` == phoneNumberId → O(1) inbound routing via
 * getDocument(phoneNumberId). The real access token lives in Function env /
 * Appwrite secret keyed by accessTokenRef, never queryable in a doc.
 */
export const whatsappAccounts: CollectionDefinition = {
  id: "whatsapp_accounts",
  name: "WhatsApp Accounts",
  documentSecurity: true,
  naturalKey: "phoneNumberId",
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.string("wabaId", 64),
    attr.string("phoneNumberId", 64, { required: true }),
    attr.string("displayPhoneNumber", 32),
    attr.string("verifiedName", 256),
    attr.string("accessTokenRef", 128),
    attr.enum("status", ["connected", "disconnected", "error"], {
      default: "connected",
    }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
  ],
};

export default whatsappAccounts;
