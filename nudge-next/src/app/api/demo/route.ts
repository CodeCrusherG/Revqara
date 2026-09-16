/**
 * Public, NO-AUTH demo endpoint for the marketing demo playground.
 *
 * Runs the real universal AI graph (`runMessageGraph`) against a chosen vertical
 * pack and an inbound WhatsApp-style message, and returns the live decision
 * (intent, extracted fields, pipeline stage hint, reply, handoff). No
 * persistence, no Appwrite/Clerk — the ai-graph is self-contained and
 * deterministic by default (LLM is opt-in polish only).
 *
 * Node runtime so the ai-graph + its optional fetch-based LLM client behave
 * identically to the inbound processor. A per-IP token bucket (lib/ratelimit —
 * in-memory by default, Upstash if configured) keeps the public endpoint from
 * being trivially abused; it is best-effort only and never blocks the build.
 */
import { NextResponse } from "next/server";

import {
  GRAPH_VERSION,
  getPack,
  runMessageGraph,
  type GraphResult,
} from "@/features/ai-graph";
import {
  normalizeLanguageCode,
  type IndianLanguageCode,
} from "@/lib/india-languages";
import { getRateLimiter, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
// Never statically evaluated at build — this is a request-time handler.
export const dynamic = "force-dynamic";

/** Shape returned to the demo client. */
export interface DemoResponse {
  ok: true;
  vertical: string;
  label: string;
  pipelineStages: string[];
  stageBefore: string;
  result: GraphResult;
}

export interface DemoErrorResponse {
  ok: false;
  error: string;
}

const MAX_MESSAGE_LEN = 500;

// Per-IP token bucket: 30 requests / 60s. In-memory by default; uses Upstash
// transparently when UPSTASH_REDIS_REST_URL is set (see lib/ratelimit).
const RATE_LIMIT = { tokens: 30, windowMs: 60_000, prefix: "demo" } as const;

export async function POST(req: Request): Promise<Response> {
  const limiter = await getRateLimiter(RATE_LIMIT);
  const { success } = await limiter.limit(clientKey(req));
  if (!success) {
    return NextResponse.json<DemoErrorResponse>(
      { ok: false, error: "Too many requests — slow down a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<DemoErrorResponse>(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { vertical, message, stage, language } = (body ?? {}) as {
    vertical?: unknown;
    message?: unknown;
    stage?: unknown;
    language?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json<DemoErrorResponse>(
      { ok: false, error: "Type a message to send." },
      { status: 400 },
    );
  }

  const text = message.slice(0, MAX_MESSAGE_LEN);
  const pack = getPack(typeof vertical === "string" ? vertical : "custom");
  const stageBefore =
    typeof stage === "string" && pack.pipeline_stages.includes(stage)
      ? stage
      : (pack.pipeline_stages[0] ?? "new");

  const result = await runMessageGraph({
    pack,
    messageText: text,
    history: [{ sender: "customer", text }],
    preferredLanguage:
      typeof language === "string" && language !== "auto"
        ? (normalizeLanguageCode(language) as IndianLanguageCode)
        : "auto",
  });

  return NextResponse.json<DemoResponse>(
    {
      ok: true,
      vertical: pack.vertical,
      label: pack.label,
      pipelineStages: pack.pipeline_stages,
      stageBefore,
      result: { ...result, graph_version: result.graph_version || GRAPH_VERSION },
    },
    { status: 200 },
  );
}
