/**
 * Decision node — a 1:1 port of `decide_action` and `_stage_for` from
 * `backend/ai_graph/graph.py`.
 *
 * Pure and dependency-light.
 */
import { hasKeyword } from "./intent";
import type { Decision, Intent, Pack } from "./types";

/**
 * Resolve the pipeline stage an intent implies, in this precedence order:
 *   1. `keyword_stage_hints` (stage -> keywords; first stage in pack that is in
 *      `pipeline_stages` and has a keyword match in the text). Insertion order of
 *      the object is load-bearing.
 *   2. pack `stage_hints[intent]` substrings matched against stage names.
 *   3. a hardcoded `wanted` substring map keyed by intent.
 *   4. null.
 */
export function stageFor(intent: Intent | string, pack: Pack, text?: string | null): string | null {
  const stages = pack.pipeline_stages ?? [];
  const t = (text ?? "").toLowerCase();

  const keywordHints = pack.keyword_stage_hints ?? {};
  for (const [stage, keywords] of Object.entries(keywordHints)) {
    if (stages.includes(stage) && keywords.some((k) => hasKeyword(t, k))) {
      return stage;
    }
  }

  const packHints = (pack.stage_hints ?? {})[intent] ?? [];
  for (const s of stages) {
    if (packHints.some((w) => s.toLowerCase().includes(w))) {
      return s;
    }
  }

  const WANTED: Record<string, string[]> = {
    PRICE_QUERY: ["fee", "price", "quote", "discuss"],
    PAYMENT_QUERY: ["fee", "negotiation", "po", "ordered", "booking"],
    BOOKING_QUERY: ["book", "schedul", "appointment", "demo", "visit", "itinerary"],
    RESCHEDULE: ["book", "schedul", "appointment", "visit"],
    NEW_LEAD: ["interest", "requirement", "qualified", "collected", "selected", "browsing", "symptom", "service_selected"],
    NOT_INTERESTED: ["lost"],
  };
  const wanted = WANTED[intent] ?? [];
  for (const s of stages) {
    if (wanted.some((w) => s.toLowerCase().includes(w))) {
      return s;
    }
  }
  return null;
}

/**
 * Decide the next action for an inbound message.
 *
 * Handoff is forced for `COMPLAINT` / `HUMAN_REQUEST`, or when any
 * `require_human_for` keyword matches (via {@link hasKeyword}).
 */
export function decideAction(intent: Intent | string, text: string | null | undefined, pack: Pack): Decision {
  const rules = pack.rules ?? { require_human_for: [], forbidden_claims: [], compliance_notes: [] };
  const requireHuman = (rules.require_human_for ?? []).map((k) => k.toLowerCase());
  const t = (text ?? "").toLowerCase();

  const sensitiveMatch = requireHuman.find((k) => hasKeyword(t, k)) ?? null;
  const handoff = intent === "COMPLAINT" || intent === "HUMAN_REQUEST" || Boolean(sensitiveMatch);

  let reason: string | null = null;
  if (handoff) {
    reason =
      intent === "HUMAN_REQUEST"
        ? "explicit human request"
        : intent === "COMPLAINT"
          ? "complaint / risk"
          : `matched require-human rule: ${sensitiveMatch}`;
  }

  const stageHint = stageFor(intent, pack, text);
  const nextAction: Decision["next_action"] = handoff ? "handoff" : intent === "OPT_OUT" ? "stop" : "reply";
  const tags = [intent.toString().toLowerCase()];

  return {
    next_action: nextAction,
    handoff,
    handoff_reason: reason,
    stage_hint: stageHint,
    tags,
  };
}
