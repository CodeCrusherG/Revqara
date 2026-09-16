/**
 * Test helper: a pure-TS slice of `process_inbound_message`
 * (`backend/services/inbound.py`) that exercises ONLY the AI-graph-relevant
 * decisions — opt-out / meaningful-text short-circuits, lead-stage computation
 * via the transition guard, handoff, and the deterministic ai_trace fields.
 *
 * No DB / Appwrite. It mirrors the inbound service's ordering so the ported
 * vitest assertions match the Python tests'
 * `result["status" | "stage_before" | "stage_after" | "handoff"]` and the
 * ai_trace's `confidence / confidence_source / fallback_used / model_used`.
 */
import { runMessageGraph, GRAPH_VERSION } from "../graph";
import { canAiUpdateStage, isMeaningfulText, isOptOut } from "../guards";
import { classifyIntent } from "../intent";
import { stageFor } from "../decide";
import { getPack } from "../packs";

export interface SimResult {
  status: "opted_out" | "unsupported_message" | "processed";
  /** number of outbound replies that would be enqueued to the outbox. */
  enqueued: number;
  intent?: string;
  stage_before?: string;
  stage_after?: string;
  ai_owned?: boolean;
  handoff?: boolean;
  response?: string | null;
  // ── ai_trace fields (only populated on the "processed" path) ──
  trace?: {
    confidence: number | null;
    confidence_source: string;
    fallback_used: boolean;
    model_used: string | null;
    graph_version: string;
    intent: string;
    stage_before: string;
    stage_after: string;
  };
}

export interface SimOptions {
  /** Mirrors a fresh conversation's `auto_reply=true` default. */
  autoReply?: boolean;
  /** Mirrors the workspace bot's `enabled` flag (default true). */
  botEnabled?: boolean;
  /** Optional knowledge base (bot.knowledge). */
  kb?: string | null;
  /** Starting lead stage (default "new", matching a freshly created lead). */
  startStage?: string;
}

/**
 * Process one inbound message through the deterministic graph + guards, exactly
 * as `process_inbound_message` would for a freshly-seeded vertical workspace.
 */
export async function simulateInbound(
  vertical: string,
  text: string | null,
  opts: SimOptions = {},
): Promise<SimResult> {
  const autoReply = opts.autoReply ?? true;
  const botEnabled = opts.botEnabled ?? true;
  const kb = opts.kb ?? null;
  const startStage = opts.startStage ?? "new";
  const pack = getPack(vertical);

  // 4. Consent — opt-out short-circuits everything.
  if (isOptOut(text)) {
    return { status: "opted_out", enqueued: 1 };
  }

  // 5. Edge case — empty / unsupported (media-only) message.
  if (!isMeaningfulText(text)) {
    const enqueued = autoReply && botEnabled ? 1 : 0;
    return { status: "unsupported_message", enqueued };
  }

  // 6. Lead capture + transition guard.
  const [intentTuple] = classifyIntent(text);
  const intent = intentTuple;
  const aiOwned = Boolean(autoReply && botEnabled);
  const humanOwned = !aiOwned;

  const stageBefore = startStage;
  let stageAfter = startStage;
  const proposed = stageFor(intent, pack, text);
  if (canAiUpdateStage(stageBefore, proposed, pack, { humanOwned, intent })) {
    stageAfter = proposed as string;
  }

  // 7. Decide / generate the reply (AI-owned only).
  let handoff = false;
  let response: string | null = null;
  let result: Awaited<ReturnType<typeof runMessageGraph>> | null = null;
  let enqueued = 0;
  if (aiOwned) {
    result = await runMessageGraph({ pack, messageText: text, contactName: "Test Customer", history: [], kb });
    handoff = result.handoff;
    response = result.response;
    enqueued = 1;
  }

  // 8. Audit trace (always — even when a human owns the thread).
  const trace = {
    confidence: result?.confidence ?? null,
    confidence_source: result?.confidence_source ?? "deterministic",
    fallback_used: Boolean(result?.fallback_used),
    model_used: result?.model_used ?? null,
    graph_version: GRAPH_VERSION,
    intent,
    stage_before: stageBefore,
    stage_after: stageAfter,
  };

  return {
    status: "processed",
    enqueued,
    intent,
    stage_before: stageBefore,
    stage_after: stageAfter,
    ai_owned: aiOwned,
    handoff,
    response,
    trace,
  };
}
