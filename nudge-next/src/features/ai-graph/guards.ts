/**
 * Safety guards for the universal AI graph — a 1:1 port of
 * `backend/ai_graph/guards.py`.
 *
 * Keep the AI from doing destructive or nonsensical things:
 *   - isOptOut          — robust opt-out / "don't message me" detection
 *   - isMeaningfulText  — empty / whitespace-only guard
 *   - canAiUpdateStage  — pipeline transition guard (no regression, no
 *                         overriding human-owned or terminal states)
 *
 * Pure functions, no DB — easy to unit-test.
 */
import type { Intent, Pack } from "./types";

/** Completed / closed states the AI must never move a lead OUT of. */
export const HARD_TERMINAL: ReadonlySet<string> = new Set([
  "won", "enrolled", "converted", "closed", "booked", "ordered",
  "po_received", "travelled", "served", "fulfilled", "consulted", "visited",
  "resolved",
]);

/** 'lost' is a soft-terminal: only a fresh buying intent may revive it. */
export const REVIVE_INTENTS: ReadonlySet<string> = new Set([
  "PRICE_QUERY", "BOOKING_QUERY", "NEW_LEAD", "PAYMENT_QUERY", "RESCHEDULE",
]);

/**
 * Opt-out: short ambiguous words must match the whole message; clear phrases
 * match as substrings.
 */
const _OPTOUT_EXACT: ReadonlySet<string> = new Set([
  "stop", "cancel", "unsubscribe", "optout", "opt out", "remove me", "stop promotions",
]);
const _OPTOUT_PHRASES: readonly string[] = [
  "unsubscribe", "opt out", "opt-out", "stop promotions", "stop messaging",
  "don't message", "do not message", "dont message", "remove me from", "leave me alone",
];

export function isOptOut(text: string | null | undefined): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return false;
  if (_OPTOUT_EXACT.has(t)) return true;
  return _OPTOUT_PHRASES.some((p) => t.includes(p));
}

/** True if there's actual text to reason about (not empty/whitespace). */
export function isMeaningfulText(text: string | null | undefined): boolean {
  return Boolean((text ?? "").trim());
}

/**
 * Decide whether the AI may move a lead from `current` to `proposed`.
 *
 * Blocks: no-ops, human-owned conversations, moving out of terminal states,
 * reviving 'lost' without a fresh buying intent, and stage regressions.
 */
export function canAiUpdateStage(
  current: string | null | undefined,
  proposed: string | null | undefined,
  pack: Pack,
  opts: { humanOwned: boolean; intent: Intent | string | null | undefined },
): boolean {
  const { humanOwned, intent } = opts;
  if (!proposed || proposed === current) return false;
  if (humanOwned) return false; // a human owns this lead — AI must not override

  const cur = (current ?? "").toLowerCase();
  if (HARD_TERMINAL.has(cur)) return false; // never move out of won/enrolled/converted/...
  if (cur === "lost") {
    return REVIVE_INTENTS.has((intent ?? "").toString().toUpperCase()); // only revive on new intent
  }

  const stages = pack.pipeline_stages ?? [];
  if (
    current != null &&
    stages.includes(current) &&
    stages.includes(proposed) &&
    stages.indexOf(proposed) < stages.indexOf(current)
  ) {
    return false; // no backward regression
  }

  return true;
}
