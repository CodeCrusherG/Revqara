import { attr, type CollectionDefinition } from "./_types";

/**
 * bots — per-workspace AI auto-reply config for the WhatsApp inbox. 1:1 per
 * workspace (workspaceId unique).
 */
export const bots: CollectionDefinition = {
  id: "bots",
  name: "Bots",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64, { required: true }),
    attr.boolean("enabled", { default: true }),
    attr.boolean("handoffEnabled", { default: true }),
    attr.string("name", 256),
    attr.string("prompt", 16_384),
    attr.string("knowledge", 65_536),
  ],
  indexes: [
    {
      key: "uq_bot_workspace",
      type: "unique",
      attributes: ["workspaceId"],
    },
  ],
};

export default bots;
