/**
 * Cache tags for revalidation. Pure constants (no server-only) so both
 * queries.ts and actions.ts can reference them. After a lead mutation we
 * revalidate both surfaces (leads board + inbox assignment panel).
 */
export const LEADS_TAG = "leads" as const;
export const INBOX_TAG = "inbox" as const;
