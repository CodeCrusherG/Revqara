/**
 * Universal AI graph — public surface.
 *
 * Self-contained (no Appwrite/Clerk imports) so it runs in vitest and inside
 * Appwrite Functions. The deterministic path is the contract; the LLM is
 * optional polish.
 */
export * from "./types";
export { classifyIntent, hasKeyword, _hasKeyword, _INTENT_RULES, _POSITIVE } from "./intent";
export { extractLeadFields, llmExtract } from "./extract";
export { decideAction, stageFor } from "./decide";
export { generateResponse, baseResponse } from "./respond";
export {
  isOptOut,
  isMeaningfulText,
  canAiUpdateStage,
  HARD_TERMINAL,
  REVIVE_INTENTS,
} from "./guards";
export { runMessageGraph, GRAPH_VERSION } from "./graph";
export type { RunMessageGraphArgs } from "./graph";
export {
  getPack,
  listVerticals,
  VERTICAL_PACKS,
  UNIVERSAL_INTENTS,
  UNIVERSAL_PIPELINE,
} from "./packs";
