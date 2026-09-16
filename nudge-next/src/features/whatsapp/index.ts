/**
 * WhatsApp pipeline — public surface (Phase 4).
 *
 * The testable core (`processInboundMessage`, `enqueueMessage`, `drainOutbox`)
 * and the pure helpers are framework-free and run in vitest against
 * `InMemoryWhatsAppRepo`. `AppwriteWhatsAppRepo` (server-only) is the real
 * data plane; import it directly from "./repo-appwrite" where node-appwrite is
 * allowed (route handlers / scripts), not via this barrel, to keep the core
 * Appwrite-free.
 */
export type * from "./repo";
export { processInboundMessage, OPT_OUT_REPLY, CLARIFY_REPLY } from "./inbound";
export type { InboundParams, InboundResult } from "./inbound";
export { enqueueMessage, drainOutbox, MAX_BACKOFF_SECONDS } from "./outbox";
export type { DrainOptions, DrainStats } from "./outbox";
export { normalizePhone } from "./normalize";
export { verifyMetaSignature, verifyChallenge } from "./verify";
export { parseInboundMessages, buildInboundPayload } from "./parse";
export type { InboundMessage } from "./parse";
export { sendText } from "./send";
export type { MessageSender } from "./send";
export { InMemoryWhatsAppRepo } from "./repo-inmemory";
