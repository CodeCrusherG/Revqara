"""
Safety guards for the universal AI graph.

These keep the AI from doing destructive or nonsensical things when real users
send weird inputs or when humans are already involved:

  * is_opt_out          — robust opt-out / "don't message me" detection
  * is_meaningful_text  — empty / whitespace-only guard
  * can_ai_update_stage — pipeline transition guard (no regression, no
                          overriding human-owned or terminal states)

Pure functions, no DB — easy to unit-test.
"""
from __future__ import annotations

# Completed / closed states the AI must never move a lead OUT of.
HARD_TERMINAL = {
    "won", "enrolled", "converted", "closed", "booked", "ordered",
    "po_received", "travelled", "served", "fulfilled", "consulted", "visited",
    "resolved",
}

# 'lost' is a soft-terminal: only a fresh buying intent may revive it.
REVIVE_INTENTS = {"PRICE_QUERY", "BOOKING_QUERY", "NEW_LEAD", "PAYMENT_QUERY", "RESCHEDULE"}

# Opt-out: short ambiguous words must match the whole message; clear phrases
# match as substrings.
_OPTOUT_EXACT = {"stop", "cancel", "unsubscribe", "optout", "opt out", "remove me", "stop promotions"}
_OPTOUT_PHRASES = [
    "unsubscribe", "opt out", "opt-out", "stop promotions", "stop messaging",
    "don't message", "do not message", "dont message", "remove me from", "leave me alone",
]


def is_opt_out(text: str | None) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    if t in _OPTOUT_EXACT:
        return True
    return any(p in t for p in _OPTOUT_PHRASES)


def is_meaningful_text(text: str | None) -> bool:
    """True if there's actual text to reason about (not empty/whitespace)."""
    return bool((text or "").strip())


def can_ai_update_stage(current: str | None, proposed: str | None, pack: dict,
                        *, human_owned: bool, intent: str | None) -> bool:
    """Decide whether the AI may move a lead from `current` to `proposed`.

    Blocks: no-ops, human-owned conversations, moving out of terminal states,
    reviving 'lost' without a fresh buying intent, and stage regressions.
    """
    if not proposed or proposed == current:
        return False
    if human_owned:
        return False  # a human owns this lead — AI must not override

    cur = (current or "").lower()
    if cur in HARD_TERMINAL:
        return False  # never move out of won/enrolled/converted/...
    if cur == "lost":
        return (intent or "").upper() in REVIVE_INTENTS  # only revive on new intent

    stages = pack.get("pipeline_stages", [])
    if current in stages and proposed in stages and stages.index(proposed) < stages.index(current):
        return False  # no backward regression

    return True
