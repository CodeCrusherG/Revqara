import { attr, JSON_SIZE, type CollectionDefinition } from "./_types";

/** variants — a message variant for a segment, with engagement counters. */
export const variants: CollectionDefinition = {
  id: "variants",
  name: "Variants",
  documentSecurity: true,
  attributes: [
    attr.string("workspaceId", 64),
    attr.string("segmentId", 64, { required: true }),
    attr.string("externalCampaignId", 64),
    attr.string("subject", 256),
    attr.string("body", 8_192, { required: true }),
    attr.boolean("hasEmoji", { default: false }),
    attr.boolean("hasUrl", { default: false }),
    attr.string("fontStylesJson", JSON_SIZE.small),
    attr.integer("sentCount", { default: 0, min: 0 }),
    attr.integer("openCount", { default: 0, min: 0 }),
    attr.integer("clickCount", { default: 0, min: 0 }),
  ],
  indexes: [
    { key: "idx_workspaceId", type: "key", attributes: ["workspaceId"] },
    { key: "idx_segmentId", type: "key", attributes: ["segmentId"] },
  ],
};

export default variants;
