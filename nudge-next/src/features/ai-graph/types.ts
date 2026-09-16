/**
 * Shared types for the universal AI graph.
 *
 * Self-contained — no Appwrite / Clerk / framework imports — so this module
 * runs identically in vitest and inside Appwrite Functions.
 */

/**
 * Universal intents the classifier always understands. The classifier emits a
 * subset of these; `FOLLOW_UP_REPLY` is reserved for the response ladder and is
 * never produced by {@link classifyIntent}.
 */
export type Intent =
  | "NEW_LEAD"
  | "FOLLOW_UP_REPLY"
  | "PRICE_QUERY"
  | "BOOKING_QUERY"
  | "SUPPORT_QUERY"
  | "COMPLAINT"
  | "PAYMENT_QUERY"
  | "RESCHEDULE"
  | "CANCEL"
  | "NOT_INTERESTED"
  | "OPT_OUT"
  | "HUMAN_REQUEST"
  | "UNKNOWN";

/** A single history turn passed into the graph for LLM context. */
export interface HistoryTurn {
  /** "customer" turns map to the human; everything else maps to the assistant. */
  sender?: string | null;
  text?: string | null;
}

/** Per-vertical compliance / safety rules. */
export interface PackRules {
  /** Keywords that force a human handoff (matched via {@link hasKeyword}). */
  require_human_for: string[];
  /** Claims the LLM must never make (fed into the LLM system prompt). */
  forbidden_claims: string[];
  /** Free-form compliance guidance (fed into the LLM system prompt). */
  compliance_notes: string[];
}

/** Response templates keyed by ladder slot. */
export interface PackTemplates {
  greeting: string;
  price_reply: string;
  follow_up: string;
  lost_lead: string;
  booking_confirmation: string;
  handoff: string;
}

/** Vertical analytics config (carried verbatim; not used by graph logic). */
export interface PackAnalytics {
  conversion_event: string;
  important_metrics: string[];
  buyer_kpis?: string[];
}

/**
 * A vertical pack — industry-specific behavior as config, not code. Optional
 * extension fields (`coaching_catalog`, `inclusion_policy`, …) are carried
 * verbatim from the Python packs for parity even though the graph ignores them.
 */
export interface Pack {
  vertical: string;
  label: string;
  lead_fields: string[];
  pipeline_stages: string[];
  intents: string[];
  qualification_questions: string[];
  templates: PackTemplates;
  tools: string[];
  rules: PackRules;
  /** intent -> substrings matched against stage names (precedence #2). */
  stage_hints: Record<string, string[]>;
  /** stage -> keywords; first matching stage wins (precedence #1). */
  keyword_stage_hints: Record<string, string[]>;
  analytics: PackAnalytics;
  // ── carried-verbatim extension fields (graph-inert) ──
  coaching_catalog?: Record<string, string[]>;
  inclusion_policy?: Record<string, unknown>;
}

/** Output of {@link decideAction}. */
export interface Decision {
  next_action: "handoff" | "stop" | "reply";
  handoff: boolean;
  handoff_reason: string | null;
  stage_hint: string | null;
  tags: string[];
}

/** Full result of {@link runMessageGraph} — the inbox applies this. */
export interface GraphResult {
  vertical: string;
  intent: Intent;
  /** Always null on the deterministic path (rule-based classifier). */
  confidence: number | null;
  confidence_source: "deterministic" | "llm" | "rule" | "unknown";
  extracted_fields: Record<string, unknown>;
  next_action: Decision["next_action"];
  handoff: boolean;
  handoff_reason: string | null;
  stage_hint: string | null;
  tags: string[];
  response: string;
  response_language: string;
  fallback_used: boolean;
  model_used: string | null;
  graph_version: string;
}

/** Lightweight summary of a vertical, returned by `listVerticals`. */
export interface VerticalSummary {
  vertical: string;
  label: string;
  pipeline_stages: string[];
  lead_fields: string[];
}
