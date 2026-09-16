/**
 * Non-secret application configuration: vertical slugs, pipeline defaults, and
 * feature flags. Mirrors the ground-truth packs in
 * `backend/ai_graph/packs.py`. Plan limits live in `lib/billing/plans.ts`.
 */

export const GRAPH_VERSION = "0.6.1" as const;

/** The 12 vertical packs + `custom`. Slugs are stable identifiers. */
export const VERTICAL_SLUGS = [
  "custom",
  "coaching",
  "clinic",
  "real_estate",
  "salon",
  "ecommerce",
  "b2b",
  "travel",
  "restaurant",
  "gym",
  "automobile",
  "insurance",
  "political_party",
] as const;

export type VerticalSlug = (typeof VERTICAL_SLUGS)[number];

export const DEFAULT_VERTICAL: VerticalSlug = "custom";

/** Human-readable labels (parity with frontend/src/lib/verticals.js). */
export const VERTICAL_LABELS: Record<VerticalSlug, string> = {
  custom: "Custom / Other",
  coaching: "Coaching institute",
  clinic: "Clinic / Healthcare",
  real_estate: "Real estate",
  salon: "Salon / Spa",
  ecommerce: "E-commerce / D2C",
  b2b: "B2B distributor / wholesale",
  travel: "Travel / hospitality",
  restaurant: "Restaurant / cloud kitchen",
  gym: "Gym / fitness studio",
  automobile: "Automobile dealer / service",
  insurance: "Insurance / financial advisor",
  political_party: "Political party / Jan Seva office",
};

export const VERTICAL_OPTIONS = VERTICAL_SLUGS.map((value) => ({
  value,
  label: VERTICAL_LABELS[value],
}));

/**
 * Universal pipeline used by the `custom` pack and as the fallback stage set.
 * Per-vertical packs override these (validated against pack.pipeline_stages).
 */
export const UNIVERSAL_PIPELINE = [
  "new",
  "qualified",
  "contacted",
  "interested",
  "follow_up",
  "negotiation",
  "converted",
  "lost",
] as const;

export type PipelineStage = (typeof UNIVERSAL_PIPELINE)[number];

export const DEFAULT_PIPELINE_STAGE: string = "new";

/** Stages that are terminal once reached (mirrors guards.HARD_TERMINAL intent). */
export const TERMINAL_STAGES = [
  "lost",
  "converted",
  "enrolled",
  "closed",
] as const;

/** Feature flags — non-secret runtime toggles. */
export const FEATURES = {
  /** AI graph LLM polish is opt-in; deterministic path is the default. */
  llmPolish: process.env.LLM_ENABLED === "1" || process.env.LLM_ENABLED === "true",
  /** Skip real WhatsApp sends in local dev. */
  mockSend: process.env.WHATSAPP_MOCK_SEND === "1",
  /** Appwrite Realtime for the inbox (vs SSE fallback). */
  realtimeInbox: true,
} as const;

/** Default Appwrite database id. */
export const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "crm";
