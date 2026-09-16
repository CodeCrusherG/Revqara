/**
 * Universal WhatsApp Business Operating Graph — orchestrator.
 *
 * One graph for every vertical. Given an inbound message + the tenant's vertical
 * pack + conversation context, it runs the nodes:
 *
 *     classifyIntent -> extractLeadFields -> decideAction -> generateResponse
 *
 * and returns a decision the inbox applies (reply, lead stage/tags, human
 * handoff). Each node is LLM-enhanced where useful but has a deterministic,
 * vertical-aware fallback, so the graph always produces a sensible, on-brand
 * result — even with no LLM available.
 *
 * Direct port of `run_message_graph` from `backend/ai_graph/graph.py`.
 */
import { decideAction } from "./decide";
import { extractLeadFields } from "./extract";
import { classifyIntent } from "./intent";
import { llmModel } from "./llm/client";
import { generateResponse } from "./respond";
import {
  detectIndianLanguage,
  normalizeLanguageCode,
  type IndianLanguageCode,
} from "@/lib/india-languages";
import type { GraphResult, HistoryTurn, Pack } from "./types";

/** Bumped when graph decision logic changes — stamped onto every ai_trace. */
export const GRAPH_VERSION = "0.6.1";

export interface RunMessageGraphArgs {
  pack: Pack;
  messageText: string | null | undefined;
  contactName?: string | null;
  history?: HistoryTurn[];
  kb?: string | null;
  preferredLanguage?: IndianLanguageCode | "auto" | null;
}

/**
 * Run the full message graph and return the decision the inbox applies.
 *
 * On the deterministic path (no LLM) `confidence` is null with an explicit
 * source `"deterministic"` — the rule-based classifier has no honest calibrated
 * probability — and `fallback_used` is true / `model_used` is null.
 */
export async function runMessageGraph(args: RunMessageGraphArgs): Promise<GraphResult> {
  const { pack, messageText } = args;
  const history = args.history ?? [];
  const contactName = args.contactName ?? null;
  const kb = args.kb ?? null;
  const responseLanguage =
    args.preferredLanguage && args.preferredLanguage !== "auto"
      ? normalizeLanguageCode(args.preferredLanguage)
      : detectIndianLanguage(messageText);

  const [intent] = classifyIntent(messageText);
  const fields = extractLeadFields(messageText, pack);
  const decision = decideAction(intent, messageText, pack);
  const [response, usedLlm] = await generateResponse(
    intent,
    decision,
    pack,
    contactName,
    history,
    kb,
    messageText ?? "",
    responseLanguage,
  );

  return {
    vertical: pack.vertical,
    intent,
    // The classifier is deterministic/rule-based — it has no honest calibrated
    // probability, so confidence is NULL with an explicit source (per spec).
    confidence: null,
    confidence_source: "deterministic",
    extracted_fields: fields,
    next_action: decision.next_action,
    handoff: decision.handoff,
    handoff_reason: decision.handoff_reason,
    stage_hint: decision.stage_hint,
    tags: decision.tags,
    response,
    response_language: responseLanguage,
    fallback_used: !usedLlm,
    model_used: usedLlm ? llmModel() : null,
    graph_version: GRAPH_VERSION,
  };
}
