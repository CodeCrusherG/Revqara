/**
 * Deterministic intent classification — a 1:1 port of `classify_intent` and
 * `_has_keyword` from `backend/ai_graph/graph.py`.
 *
 * Pure and dependency-free.
 */
import type { Intent } from "./types";

/**
 * Deterministic intent keywords, checked in priority order. The ordering — and
 * the duplicate `PAYMENT_QUERY` rule positions — are load-bearing and must not
 * be reordered.
 */
export const _INTENT_RULES: ReadonlyArray<readonly [Intent, readonly string[]]> = [
  ["OPT_OUT", ["stop", "unsubscribe", "opt out", "optout"]],
  ["HUMAN_REQUEST", ["agent", "human", "representative", "talk to someone", "call me", "speak to a"]],
  [
    "COMPLAINT",
    ["complaint", "worst", "terrible", "angry", "not working", "cheated", "disappointed", "bad service", "horrible"],
  ],
  ["PAYMENT_QUERY", ["payment", "paid", "invoice", "installment", "emi", "pay link", "upi", "how to pay"]],
  ["RESCHEDULE", ["reschedule", "postpone", "change the time", "change my appointment", "shift my"]],
  ["CANCEL", ["cancel"]],
  ["PRICE_QUERY", ["price", "fee", "fees", "cost", "charge", "rate", "kitna", "how much", "pricing", "quote", "quotation"]],
  ["BOOKING_QUERY", ["book", "appointment", "slot", "schedule", "visit", "demo", "reserve", "booking", "when can"]],
  ["PAYMENT_QUERY", ["pay "]],
  [
    "SUPPORT_QUERY",
    ["how do", "where", "timing", "hours", "location", "address", "document", "help", "info", "details", "available", "availability", "refund policy"],
  ],
  ["NOT_INTERESTED", ["not interested", "no thanks", "not now", "maybe later", "leave me"]],
];

export const _POSITIVE: readonly string[] = [
  "interested", "yes", "tell me", "want", "need", "looking for", "send", "share", "more info", "hi", "hello", "hey",
];

/** Matches `/^[a-z0-9]+$/` — a "short token" eligible for boundary matching. */
const ALNUM_TOKEN = /^[a-z0-9]+$/;

/** Escape a string for safe use inside a RegExp (mirrors Python `re.escape`). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match phrases safely. Short tokens like `sc`/`st` must NOT match inside
 * ordinary words such as `street` or `worst`.
 *
 * For pure alphanumeric keywords we use the boundary regex
 * `(?<![a-z0-9])kw(?![a-z0-9])` — a direct port of the Python `_has_keyword`
 * regex (lookbehind is supported on the ES2022 / Node 20 target). Otherwise we
 * fall back to a substring test (`kw in text`).
 */
export function hasKeyword(text: string, keyword: string): boolean {
  const kw = (keyword ?? "").trim().toLowerCase();
  if (!kw) return false;
  if (ALNUM_TOKEN.test(kw)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(kw)}(?![a-z0-9])`);
    return re.test(text);
  }
  return text.includes(kw);
}

/** Internal alias preserving the Python `_has_keyword` name for fidelity. */
export const _hasKeyword = hasKeyword;

/**
 * Classify the intent of an inbound message.
 *
 * Iterates `_INTENT_RULES` in order, returning the first match at confidence
 * 0.75; else falls back to `_POSITIVE` -> `NEW_LEAD@0.55`; else `UNKNOWN@0.3`.
 */
export function classifyIntent(text: string | null | undefined): [Intent, number] {
  const t = (text ?? "").toLowerCase();
  for (const [intent, kws] of _INTENT_RULES) {
    if (kws.some((k) => hasKeyword(t, k))) {
      return [intent, 0.75];
    }
  }
  if (_POSITIVE.some((p) => hasKeyword(t, p))) {
    return ["NEW_LEAD", 0.55];
  }
  return ["UNKNOWN", 0.3];
}
