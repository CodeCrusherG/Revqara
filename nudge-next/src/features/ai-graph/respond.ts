/**
 * Response generation — a port of `generate_response` (+ `_llm_response`) from
 * `backend/ai_graph/graph.py`.
 *
 * The deterministic template ladder is the contract; the LLM is optional polish
 * that falls back to the template on any failure. With the LLM disabled this is
 * byte-for-byte identical to the Python deterministic path
 * (`used_llm === false`).
 */
import type { ChatMessage } from "./llm/client";
import { chat, llmEnabled } from "./llm/client";
import {
  REGIONAL_REPLY_COPY,
  languageInstruction,
  normalizeLanguageCode,
  type IndianLanguageCode,
} from "@/lib/india-languages";
import type { Decision, HistoryTurn, Intent, Pack } from "./types";

/**
 * Build the deterministic base reply via the exact if/elif template ladder.
 * `SUPPORT_QUERY` uses `kb.slice(0, 300)`.
 */
export function baseResponse(
  intent: Intent | string,
  decision: Decision,
  pack: Pack,
  kb: string | null | undefined,
  _messageText: string,
): string {
  const t = pack.templates;
  const q = pack.qualification_questions && pack.qualification_questions.length > 0
    ? pack.qualification_questions
    : ["What are you looking for?"];

  if (decision.handoff) {
    return t.handoff;
  }
  if (intent === "PRICE_QUERY") {
    return t.price_reply;
  }
  if (intent === "BOOKING_QUERY" || intent === "RESCHEDULE") {
    return `Sure — happy to help with that. ${q[0]}`;
  }
  if (intent === "CANCEL") {
    return "No problem, I can help with that. Could you share your booking details so I can pull it up?";
  }
  if (intent === "PAYMENT_QUERY") {
    return "Sure — I can help with payment. Let me get the details and share a secure link.";
  }
  if (intent === "NOT_INTERESTED") {
    return t.lost_lead;
  }
  if (intent === "FOLLOW_UP_REPLY") {
    return t.follow_up;
  }
  if (intent === "SUPPORT_QUERY") {
    return kb ? `Happy to help! Here's what I can share:\n${kb.slice(0, 300)}` : `Happy to help! ${q[0]}`;
  }
  // NEW_LEAD / UNKNOWN
  return t.greeting;
}

/**
 * Returns `[replyText, usedLlm]`. `usedLlm` is false when the deterministic
 * template was used because no LLM was reachable / enabled.
 */
export async function generateResponse(
  intent: Intent | string,
  decision: Decision,
  pack: Pack,
  contactName: string | null | undefined,
  history: HistoryTurn[],
  kb: string | null | undefined,
  messageText: string,
  language: IndianLanguageCode = "en",
): Promise<[string, boolean]> {
  const base = baseResponse(intent, decision, pack, kb, messageText);
  const responseLanguage = normalizeLanguageCode(language);
  const regionalBase =
    responseLanguage === "en"
      ? base
      : regionalFallbackResponse(intent, decision, responseLanguage);
  const llm = await llmResponse(
    regionalBase,
    intent,
    pack,
    contactName,
    history,
    kb,
    messageText,
    responseLanguage,
  );
  return llm ? [llm, true] : [regionalBase, false];
}

function regionalFallbackResponse(
  intent: Intent | string,
  decision: Decision,
  language: IndianLanguageCode,
): string {
  const copy = REGIONAL_REPLY_COPY[language] ?? REGIONAL_REPLY_COPY.en;
  if (decision.handoff) return copy.handoff;
  if (intent === "PRICE_QUERY") return copy.price;
  if (intent === "BOOKING_QUERY" || intent === "RESCHEDULE") return copy.booking;
  if (intent === "CANCEL") return copy.cancel;
  if (intent === "PAYMENT_QUERY") return copy.payment;
  if (intent === "NOT_INTERESTED" || intent === "OPT_OUT") return copy.lost;
  if (intent === "SUPPORT_QUERY") return copy.support;
  return copy.greeting;
}

/**
 * LLM polish (vertical persona + style), with safe fallback to the template.
 * Mirrors `_llm_response`. Returns `null` when disabled or on any failure.
 */
async function llmResponse(
  template: string,
  intent: Intent | string,
  pack: Pack,
  _contactName: string | null | undefined,
  history: HistoryTurn[],
  kb: string | null | undefined,
  messageText: string,
  language: IndianLanguageCode,
): Promise<string | null> {
  if (!llmEnabled()) return null;
  try {
    const forbidden = pack.rules?.forbidden_claims ?? [];
    const notes = pack.rules?.compliance_notes ?? [];
    const system =
      `You are the WhatsApp assistant for a ${pack.label} business. Be warm, concise (1-3 sentences), ` +
      `${languageInstruction(language)} ` +
      `and helpful. The customer's intent is ${intent}. Reply in that spirit, matching this reference style: ` +
      `"${template}". ` +
      (kb ? `Knowledge base:\n${kb.slice(0, 1500)}\n` : "") +
      (forbidden.length ? `NEVER claim: ${forbidden.join(", ")}. ` : "") +
      notes.join(" ");

    const messages: ChatMessage[] = [{ role: "system", content: system }];
    for (const h of (history ?? []).slice(-6)) {
      messages.push(
        h.sender === "customer"
          ? { role: "user", content: h.text ?? "" }
          : { role: "assistant", content: h.text ?? "" },
      );
    }
    messages.push({ role: "user", content: messageText ?? "" });

    const out = await chat(messages, { temperature: 0.3, maxTokens: 350 });
    const trimmed = (out ?? "").trim();
    return trimmed ? trimmed.slice(0, 1000) : null;
  } catch {
    return null;
  }
}
