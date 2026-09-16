/**
 * Best-effort lead-field extraction — a port of `extract_lead_fields` from
 * `backend/ai_graph/graph.py`.
 *
 * The deterministic path is a couple of safe heuristics (currently a budget-like
 * number). The optional LLM seam (`llmExtract`) mirrors the Python
 * `_llm_extract`, but is only consulted when the LLM is enabled — when it is
 * unset/false this module is byte-for-byte identical to the deterministic Python
 * path (`confidence:null`, deterministic).
 */
import type { ChatMessage } from "./llm/client";
import { chat, llmEnabled } from "./llm/client";
import type { Pack } from "./types";

/** Matches an optional ₹/rs. prefix then a 3+ digit (comma-grouped) number. */
const BUDGET_RE = /(?:₹|rs\.?\s*)?(\d[\d,]{2,})/;

/**
 * Deterministic, synchronous extraction. Mirrors the non-LLM branch of
 * `extract_lead_fields`: extracts a budget-like number when the pack has a
 * budget/income/fee field. No LLM call (kept pure so `runMessageGraph`'s
 * deterministic path stays sync and reproducible).
 */
export function extractLeadFields(text: string | null | undefined, pack: Pack): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const t = (text ?? "").toLowerCase();
  const m = BUDGET_RE.exec(t);
  if (m && pack.lead_fields.some((f) => f.includes("budget") || f.includes("income") || f.includes("fee"))) {
    fields.budget = m[1].replace(/,/g, "");
  }
  return fields;
}

/**
 * Optional LLM field extraction (mirrors `_llm_extract`). Returns `null` when the
 * LLM is disabled or on any failure. Provider-agnostic; never throws.
 *
 * Not wired into the deterministic graph path — callers that want LLM-assisted
 * extraction await this explicitly and merge the result.
 */
export async function llmExtract(
  text: string | null | undefined,
  pack: Pack,
): Promise<Record<string, unknown> | null> {
  if (!llmEnabled()) return null;
  try {
    const fields = pack.lead_fields;
    const system =
      "Extract any of these fields from the customer's WhatsApp message as flat JSON " +
      `(omit unknowns): ${JSON.stringify(fields)}. Return ONLY JSON.`;
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: text ?? "" },
    ];
    const raw = await chat(messages, { temperature: 0.3, maxTokens: 350 });
    if (!raw) return null;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (fields.includes(k) && v) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
