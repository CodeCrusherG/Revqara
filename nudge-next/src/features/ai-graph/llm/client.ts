// NOTE: deliberately NOT "server-only" — this module (and the whole ai-graph)
// must run in vitest and inside Appwrite Functions (Node), neither of which is
// a React Server Component. It uses only process.env + fetch, safe in Node.

/**
 * Optional LLM client for graph polish.
 *
 * The deterministic graph is the contract. The LLM is polish only: `chat()`
 * NEVER throws and returns `null` on any failure — and when `LLM_ENABLED` is
 * unset/false it short-circuits to `null` without any network call, so the graph
 * is byte-for-byte identical to the deterministic Python path.
 *
 * Provider-agnostic: env-driven base URL / model / key. Works as a drop-in for
 * an Ollama or Anthropic-Messages-style chat endpoint.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Truthy-but-explicit check for the `LLM_ENABLED` env flag. */
export function llmEnabled(): boolean {
  const v = (process.env.LLM_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** The model id reported on traces when the LLM is used (env-overridable). */
export function llmModel(): string {
  return process.env.LLM_MODEL || process.env.OLLAMA_MODEL || "mistral:latest";
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Run a chat completion. Returns the assistant text, or `null` if the LLM is
 * disabled, misconfigured, times out, or errors in any way. Guaranteed not to
 * throw.
 */
export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!llmEnabled()) return null;

  const baseUrl = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const apiKey = process.env.LLM_API_KEY || "";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: llmModel(),
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 350,
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const text = extractContent(data);
    const trimmed = (text ?? "").trim();
    return trimmed || null;
  } catch {
    // Any failure (network, abort/timeout, parse) -> deterministic fallback.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Best-effort content extraction across OpenAI-/Ollama-/Anthropic-ish shapes. */
function extractContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // OpenAI / Ollama OpenAI-compat: choices[0].message.content
  const choices = d.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content;
  }

  // Anthropic Messages: content[0].text
  const content = d.content;
  if (Array.isArray(content) && content.length > 0) {
    const block = content[0] as Record<string, unknown>;
    if (typeof block?.text === "string") return block.text;
  }

  // Bare string fallbacks.
  if (typeof d.content === "string") return d.content;
  if (typeof d.response === "string") return d.response;

  return null;
}
