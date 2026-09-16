/**
 * Deterministic-by-default JS port of the 5-stage agentic campaign flow
 * (Profiler → Planner → Creative → Analyst → Optimizer).
 *
 * Ground truth: backend/workflows/langgraph_flow.py, backend/agents/*,
 * backend/ml/engagement_predictor.py.
 *
 * Design:
 *   - PURE module: no Appwrite, no Clerk, no `server-only`. It transforms plain
 *     data (customer profiles + brief) into segments / variants / predictions /
 *     agent logs. Persistence to Appwrite (campaigns.stateCheckpointJson +
 *     agent_logs + segments + variants) lives in actions.ts, which calls these.
 *   - DETERMINISTIC by default. Each generative stage (plan, creative) exposes an
 *     optional LLM seam via the ai-graph `chat()` client; when LLM is disabled
 *     (the default, parity with the Python deterministic fallback) the stages
 *     degrade to the exact deterministic stubs ported from agents/planner.py and
 *     agents/generator.py.
 *   - SYNCHRONOUS-ENOUGH to run inside a server action (no always-on worker). The
 *     HITL pause is just a status flip (pending_approval); approval re-enters via
 *     a separate action. A campaign-scheduler note: future-dated campaigns are
 *     left in `scheduled` and a cron Appwrite Function (campaign-scheduler) would
 *     flip them to `profiling` + run this pipeline — not required for the demo.
 */

import { chat, llmEnabled, llmModel } from "@/features/ai-graph/llm/client";
import {
  languageInstruction,
  normalizeLanguageCode,
  type IndianLanguageCode,
} from "@/lib/india-languages";
import type {
  AgentName,
  Prediction,
  SegmentView,
  VariantView,
} from "./types";

// ── Profile shape (camelCase, as read from customer_profiles / contacts) ─────

export interface PipelineProfile {
  customerId: string;
  fullName?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  monthlyIncome?: number | null;
  creditScore?: number | null;
  kycStatus?: string | null;
  appInstalled?: string | null;
  existingCustomer?: string | null;
  socialMediaActive?: string | null;
  occupationType?: string | null;
  maritalStatus?: string | null;
  familySize?: number | null;
  segmentTag?: string | null;
}

// ── Constants (ported verbatim) ──────────────────────────────────────────────

const TIER1_CITIES = new Set([
  "delhi",
  "mumbai",
  "bangalore",
  "bengaluru",
  "hyderabad",
  "chennai",
  "pune",
  "kolkata",
  "ahmedabad",
  "jaipur",
  "lucknow",
  "bhopal",
  "kochi",
  "indore",
]);
/** Predictor uses a tighter Tier-1 set (engagement_predictor.TIER1_CITIES). */
const TIER1_CITIES_PRED = new Set([
  "delhi",
  "mumbai",
  "bangalore",
  "bengaluru",
  "hyderabad",
  "chennai",
  "pune",
  "kolkata",
]);

const HIGH_ENGAGEMENT_HOURS = new Set([8, 9, 12, 13, 18, 19, 20]);
const NIGHT_HOURS = new Set([0, 1, 2, 3, 4, 5]);

const ALLOWED_URL = "https://superbfsi.com/xdeposit/explore/";

const CRITERIA_KEY_ALIASES: Record<string, string> = {
  age: "age",
  gender: "gender",
  city: "city",
  monthly_income: "monthlyIncome",
  "monthly income": "monthlyIncome",
  credit_score: "creditScore",
  "credit score": "creditScore",
  kyc_status: "kycStatus",
  "kyc status": "kycStatus",
  app_installed: "appInstalled",
  "app installed": "appInstalled",
  existing_customer: "existingCustomer",
  "existing customer": "existingCustomer",
  social_media_active: "socialMediaActive",
  "social media active": "socialMediaActive",
  occupation_type: "occupationType",
  "occupation type": "occupationType",
  marital_status: "maritalStatus",
  "marital status": "maritalStatus",
  family_size: "familySize",
  "family size": "familySize",
};

// ── Agent log accumulator ────────────────────────────────────────────────────

export interface StageLog {
  agentName: AgentName;
  step: number;
  inputPayload: unknown;
  outputPayload: unknown;
  llmReasoning: string;
}

// ── Plan + variant intermediate shapes ───────────────────────────────────────

interface PlannedSegment {
  label: string;
  variantType: string;
  criteria: Record<string, unknown>;
  sendTime: string;
  rationale: string;
}

export interface PipelineSegment
  extends Omit<SegmentView, "variants" | "id" | "campaignId"> {
  variantType: string;
  rationale: string;
}

export interface PipelineVariant
  extends Omit<VariantView, "id" | "segmentId" | "externalCampaignId"> {
  variantType: string;
  prediction: Prediction;
}

export interface PipelineOutput {
  segments: PipelineSegment[];
  /** variant[i] belongs to segment[i] (one variant per segment, as in the port). */
  variants: PipelineVariant[];
  logs: StageLog[];
  llmUsed: boolean;
}

// ── Time helpers (IST future send-time, DD:MM:YY HH:MM:SS) ────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Format a future IST send-time `DD:MM:YY HH:MM:SS`, `minutesAhead` from now. */
export function formatFutureIstTime(
  minutesAhead: number,
  now: Date = new Date(),
): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS + minutesAhead * 60_000);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(ist.getUTCFullYear() % 100).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mi = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${dd}:${mm}:${yy} ${hh}:${mi}:${ss}`;
}

function safeInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// ── STAGE 0: Profiler — derive deterministic tags + taxonomy ─────────────────

export interface Taxonomy {
  [tag: string]: { description: string; count: number; sampleCustomerIds: string[] };
}

/** Port of profiler._derive_tags_and_taxonomy (deterministic path). */
export function deriveTagsAndTaxonomy(profiles: PipelineProfile[]): {
  tagsByCustomer: Record<string, string>;
  taxonomy: Taxonomy;
} {
  const tagsByCustomer: Record<string, string> = {};
  const buckets: Record<string, string[]> = {};

  for (const c of profiles) {
    const cid = c.customerId;
    if (!cid) continue;
    const age = safeInt(c.age);
    const income = safeInt(c.monthlyIncome);
    const city = String(c.city ?? "").trim().toLowerCase();
    const app = String(c.appInstalled ?? "N").trim().toUpperCase();
    const social = String(c.socialMediaActive ?? "N").trim().toUpperCase();
    const existing = String(c.existingCustomer ?? "N").trim().toUpperCase();
    const kyc = String(c.kycStatus ?? "N").trim().toUpperCase();

    const parts: string[] = [];
    if (age !== null && age <= 35) parts.push("young");
    else if (age !== null && age >= 55) parts.push("senior");
    if (income !== null && income >= 200000) parts.push("high_income");
    else if (income !== null && income <= 60000) parts.push("low_income");
    if (TIER1_CITIES.has(city)) parts.push("tier1");
    if (app === "Y") parts.push("app_user");
    if (social === "Y") parts.push("social_active");
    if (existing === "Y") parts.push("existing");
    if (kyc === "Y") parts.push("kyc");

    const tagParts = parts.length > 0 ? parts.slice(0, 5) : ["unclassified"];
    const tag = tagParts.join("_");
    tagsByCustomer[cid] = tag;
    (buckets[tag] ??= []).push(cid);
  }

  const taxonomy: Taxonomy = {};
  for (const [tag, ids] of Object.entries(buckets)) {
    taxonomy[tag] = {
      description: tag.replace(/_/g, " "),
      count: ids.length,
      sampleCustomerIds: ids.slice(0, 7),
    };
  }
  return { tagsByCustomer, taxonomy };
}

// ── STAGE 1: Planner ─────────────────────────────────────────────────────────

/** Deterministic 3-segment plan — port of planner._build_deterministic_plan. */
function deterministicPlan(now: Date): PlannedSegment[] {
  return [
    {
      label: "Segment A – Young Tier-1 Professionals",
      variantType: "A",
      criteria: { age: [20, 35], city: ["tier1_city"], occupation_type: "professional" },
      sendTime: formatFutureIstTime(45, now),
      rationale: "Acquire young professionals in Tier-1 cities with energetic messaging.",
    },
    {
      label: "Segment B – High-Income Digital Customers",
      variantType: "B",
      criteria: { monthly_income: [200000, null], social_media_active: "Y" },
      sendTime: formatFutureIstTime(90, now),
      rationale: "Target affluent digitally active users with premium value framing.",
    },
    {
      label: "Segment C – Existing Customers",
      variantType: "C",
      criteria: { existing_customer: "Y" },
      sendTime: formatFutureIstTime(135, now),
      rationale: "Retain and upsell known customers with trust-based communication.",
    },
  ];
}

function normalizeBooleanLike(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1") return "y";
  if (v === "no" || v === "false" || v === "0") return "n";
  return v;
}

function normalizeCriteriaKey(key: string): string {
  const raw = String(key).trim().toLowerCase().replace(/_/g, " ");
  return CRITERIA_KEY_ALIASES[raw] ?? raw.replace(/ /g, "_");
}

function valueMatches(key: string, profileValue: unknown, criterion: unknown): boolean {
  if (profileValue === null || profileValue === undefined) return false;
  const keyNorm = String(key).trim().toLowerCase();
  let profileNorm = normalizeBooleanLike(String(profileValue).trim().toLowerCase());
  const criterionNorm = normalizeBooleanLike(String(criterion).trim().toLowerCase());

  if (
    keyNorm === "city" &&
    ["tier1_city", "tier-1", "tier1", "tier-1 city", "tier1 city", "tier-1 cities", "tier1 cities"].includes(
      criterionNorm,
    )
  ) {
    return TIER1_CITIES.has(profileNorm);
  }
  if (
    keyNorm === "occupationtype" &&
    ["professional", "salaried", "young professionals", "young professional"].includes(criterionNorm)
  ) {
    return ["full-time", "full time", "professional", "salaried"].includes(profileNorm);
  }
  if (keyNorm === "city" && profileNorm.includes(criterionNorm.replace(/-/g, " "))) {
    return true;
  }
  return profileNorm === criterionNorm;
}

/** Port of planner._profile_matches_criteria. */
function profileMatchesCriteria(
  profile: PipelineProfile,
  criteria: Record<string, unknown>,
): boolean {
  for (const [key, criterion] of Object.entries(criteria)) {
    const normKey = normalizeCriteriaKey(key);
    const profileValue = (profile as unknown as Record<string, unknown>)[normKey];

    if (
      Array.isArray(criterion) &&
      criterion.length === 2 &&
      criterion.every((x) => x === null || typeof x === "number")
    ) {
      if (profileValue === null || profileValue === undefined) return false;
      const [low, high] = criterion as [number | null, number | null];
      const pv = Number(profileValue);
      if (low !== null && pv < low) return false;
      if (high !== null && pv > high) return false;
      continue;
    }
    if (Array.isArray(criterion)) {
      if (!criterion.some((c) => valueMatches(normKey, profileValue, c))) return false;
      continue;
    }
    if (!valueMatches(normKey, profileValue, criterion)) return false;
  }
  return true;
}

/**
 * Plan segments + apply the 100%-coverage assignment logic (port of run_planner).
 * Returns segments with assigned customerIds. Deterministic unless the optional
 * LLM seam returns a usable plan.
 */
export async function planSegments(
  profiles: PipelineProfile[],
  brief: string,
  rejectionFeedback: string | null,
  now: Date = new Date(),
): Promise<{ segments: Omit<PipelineSegment, "predictedOpenRate" | "predictedClickRate">[]; log: StageLog }> {
  let planned = deterministicPlan(now);
  let llmUsed = false;
  let reasoning = "";

  if (llmEnabled()) {
    const llmPlan = await tryLlmPlan(profiles, brief, rejectionFeedback);
    if (llmPlan && llmPlan.length > 0) {
      planned = llmPlan;
      llmUsed = true;
    }
  }
  reasoning = JSON.stringify({
    fallback: llmUsed ? null : "deterministic",
    strategy_rationale: llmUsed
      ? "LLM-planned segments"
      : "Deterministic fallback strategy balancing young Tier-1 prospects, high-income digital users, and existing customers.",
    segments: planned.map((p) => ({ label: p.label, criteria: p.criteria })),
  });

  // 100% coverage assignment (port of run_planner).
  const assigned = new Set<string>();
  const out: Omit<PipelineSegment, "predictedOpenRate" | "predictedClickRate">[] = [];

  planned.forEach((seg, idx) => {
    const segIds: string[] = [];
    for (const p of profiles) {
      if (assigned.has(p.customerId)) continue;
      if (profileMatchesCriteria(p, seg.criteria)) {
        segIds.push(p.customerId);
        assigned.add(p.customerId);
      }
    }
    // Prevent empty non-final segments.
    if (idx < planned.length - 1 && segIds.length === 0) {
      const remaining = profiles.filter((p) => !assigned.has(p.customerId)).map((p) => p.customerId);
      const remainingSegments = Math.max(1, planned.length - idx);
      const take = Math.max(1, Math.floor(remaining.length / remainingSegments));
      for (const id of remaining.slice(0, take)) {
        segIds.push(id);
        assigned.add(id);
      }
    }
    // Last segment grabs all remaining (100% coverage).
    if (idx === planned.length - 1) {
      for (const p of profiles) {
        if (!assigned.has(p.customerId)) {
          segIds.push(p.customerId);
          assigned.add(p.customerId);
        }
      }
    }

    out.push({
      label: seg.label,
      variantType: seg.variantType,
      criteria: seg.criteria,
      customerIds: segIds,
      sendTime: seg.sendTime,
      rationale: seg.rationale,
    });
  });

  return {
    segments: out,
    log: {
      agentName: "CampaignPlanner",
      step: 2,
      inputPayload: { brief, total_profiles: profiles.length },
      outputPayload: { segment_count: out.length, llm_used: llmUsed },
      llmReasoning: reasoning,
    },
  };
}

async function tryLlmPlan(
  profiles: PipelineProfile[],
  brief: string,
  rejectionFeedback: string | null,
): Promise<PlannedSegment[] | null> {
  const sample = profiles.slice(0, 5).map((p) => ({
    customer_id: p.customerId,
    age: p.age,
    city: p.city,
    monthly_income: p.monthlyIncome,
    existing_customer: p.existingCustomer,
    social_media_active: p.socialMediaActive,
    occupation_type: p.occupationType,
  }));
  const text = await chat([
    {
      role: "system",
      content:
        "You are the Campaign Planner. Create 2-3 complementary campaign segments. " +
        'Output JSON only: {"segments":[{"label":"...","variant_type":"A","criteria":{"existing_customer":"Y"},"send_time":"15:03:26 12:00:00","rationale":"..."}]}',
    },
    {
      role: "user",
      content:
        `Campaign brief: ${brief}${rejectionFeedback ? `\n\nHUMAN FEEDBACK (must be addressed): ${rejectionFeedback}` : ""}\n\n` +
        `Total customers: ${profiles.length}\nSample profiles:\n${JSON.stringify(sample, null, 2)}`,
    },
  ]);
  if (!text) return null;
  try {
    const parsed = JSON.parse(stripCodeFences(text)) as { segments?: unknown };
    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) return null;
    const now = new Date();
    return (parsed.segments as Record<string, unknown>[]).map((s, i) => ({
      label: typeof s.label === "string" ? s.label : `Segment ${i + 1}`,
      variantType: typeof s.variant_type === "string" ? s.variant_type : String.fromCharCode(65 + i),
      criteria: typeof s.criteria === "object" && s.criteria !== null ? (s.criteria as Record<string, unknown>) : {},
      sendTime: typeof s.send_time === "string" ? s.send_time : formatFutureIstTime(45 + i * 45, now),
      rationale: typeof s.rationale === "string" ? s.rationale : "",
    }));
  } catch {
    return null;
  }
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    const parts = t.split("```");
    t = parts.length > 1 ? parts[1] : t;
    if (t.startsWith("json")) t = t.slice(4);
  }
  return t.trim();
}

// ── STAGE 2: Creative (Generator) ────────────────────────────────────────────

const URL_PATTERN = /https?:\/\/\S+/g;

function enforceSubjectRules(subject: string): string {
  return subject.replace(URL_PATTERN, "").trim().slice(0, 200);
}
function enforceBodyRules(body: string): string {
  return body.replace(/<[^>]+>/g, "").trim().slice(0, 5000);
}

const CAMPAIGN_COPY: Record<
  IndianLanguageCode,
  {
    default: { subject: string; body: string };
    premium: { subject: string; body: string };
    existing: { subject: string; body: string };
  }
> = {
  en: {
    default: {
      subject: "Start Saving Smarter Today 🚀",
      body:
        "**Build your future faster.** Discover flexible deposit options and strong returns. **Explore now** at " +
        ALLOWED_URL,
    },
    premium: {
      subject: "Premium Deposit Benefits Await You 💼",
      body:
        "**Grow your wealth with confidence.** Unlock premium deposit benefits crafted for your goals. **Claim today** at " +
        ALLOWED_URL,
    },
    existing: {
      subject: "Exclusive Deposit Offer for You 🤝",
      body:
        "**Thanks for banking with us.** Your personalised deposit offer is live. **Tap now** and activate it at " +
        ALLOWED_URL,
    },
  },
  hi: {
    default: {
      subject: "आज से बेहतर बचत शुरू करें 🚀",
      body: `**अपना भविष्य मजबूत बनाएं।** लचीले डिपॉज़िट विकल्प और बेहतर रिटर्न देखें। **अभी जानें**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "प्रीमियम डिपॉज़िट लाभ आपके लिए 💼",
      body: `**आत्मविश्वास के साथ धन बढ़ाएं।** आपके लक्ष्यों के लिए बने प्रीमियम डिपॉज़िट लाभ देखें। **आज ही क्लेम करें**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "आपके लिए खास डिपॉज़िट ऑफर 🤝",
      body: `**हमारे साथ जुड़े रहने के लिए धन्यवाद।** आपका पर्सनल डिपॉज़िट ऑफर लाइव है। **अभी एक्टिवेट करें**: ${ALLOWED_URL}`,
    },
  },
  ta: {
    default: {
      subject: "இன்றே புத்திசாலித்தனமான சேமிப்பை தொடங்குங்கள் 🚀",
      body: `**உங்கள் எதிர்காலத்தை வேகமாக கட்டுங்கள்.** நெகிழ்வான டெபாசிட் விருப்பங்கள் மற்றும் நல்ல வருமானத்தை பாருங்கள். **இப்போது பார்க்கவும்**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "பிரீமியம் டெபாசிட் நன்மைகள் உங்களுக்காக 💼",
      body: `**நம்பிக்கையுடன் உங்கள் செல்வத்தை வளர்த்திடுங்கள்.** உங்கள் இலக்குகளுக்கான பிரீமியம் டெபாசிட் நன்மைகளை திறக்கவும். **இன்றே பெறுங்கள்**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "உங்களுக்கான சிறப்பு டெபாசிட் சலுகை 🤝",
      body: `**எங்களுடன் இருப்பதற்கு நன்றி.** உங்கள் தனிப்பட்ட டெபாசிட் சலுகை தயார். **இப்போது செயல்படுத்தவும்**: ${ALLOWED_URL}`,
    },
  },
  te: {
    default: {
      subject: "ఈరోజే స్మార్ట్ సేవింగ్ ప్రారంభించండి 🚀",
      body: `**మీ భవిష్యత్తును వేగంగా నిర్మించండి.** అనుకూలమైన డిపాజిట్ ఎంపికలు మరియు మంచి రిటర్న్స్ చూడండి. **ఇప్పుడు చూడండి**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "మీ కోసం ప్రీమియం డిపాజిట్ ప్రయోజనాలు 💼",
      body: `**నమ్మకంతో మీ సంపదను పెంచుకోండి.** మీ లక్ష్యాలకు సరిపోయే ప్రీమియం డిపాజిట్ ప్రయోజనాలు పొందండి. **ఈరోజే క్లెయిమ్ చేయండి**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "మీ కోసం ప్రత్యేక డిపాజిట్ ఆఫర్ 🤝",
      body: `**మాతో కొనసాగుతున్నందుకు ధన్యవాదాలు.** మీ వ్యక్తిగత డిపాజిట్ ఆఫర్ సిద్ధంగా ఉంది. **ఇప్పుడే యాక్టివేట్ చేయండి**: ${ALLOWED_URL}`,
    },
  },
  gu: {
    default: {
      subject: "આજથી સ્માર્ટ બચત શરૂ કરો 🚀",
      body: `**તમારું ભવિષ્ય મજબૂત બનાવો.** લવચીક ડિપોઝિટ વિકલ્પો અને સારા રિટર્ન જુઓ. **હમણાં જુઓ**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "તમારા માટે પ્રીમિયમ ડિપોઝિટ લાભ 💼",
      body: `**વિશ્વાસ સાથે સંપત્તિ વધારો.** તમારા લક્ષ્યો માટે બનાવેલા પ્રીમિયમ ડિપોઝિટ લાભ મેળવો. **આજે ક્લેમ કરો**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "તમારા માટે ખાસ ડિપોઝિટ ઓફર 🤝",
      body: `**અમારી સાથે રહેવા બદલ આભાર.** તમારી વ્યક્તિગત ડિપોઝિટ ઓફર તૈયાર છે. **હમણાં સક્રિય કરો**: ${ALLOWED_URL}`,
    },
  },
  mr: {
    default: {
      subject: "आजपासून स्मार्ट बचत सुरू करा 🚀",
      body: `**तुमचे भविष्य जलद मजबूत करा.** लवचिक डिपॉझिट पर्याय आणि चांगले रिटर्न पहा. **आता पहा**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "तुमच्यासाठी प्रीमियम डिपॉझिट फायदे 💼",
      body: `**विश्वासाने संपत्ती वाढवा.** तुमच्या उद्दिष्टांसाठी तयार केलेले प्रीमियम डिपॉझिट फायदे मिळवा. **आजच क्लेम करा**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "तुमच्यासाठी खास डिपॉझिट ऑफर 🤝",
      body: `**आमच्यासोबत राहिल्याबद्दल धन्यवाद.** तुमची वैयक्तिक डिपॉझिट ऑफर तयार आहे. **आता सक्रिय करा**: ${ALLOWED_URL}`,
    },
  },
  pa: {
    default: {
      subject: "ਅੱਜ ਤੋਂ ਸਮਾਰਟ ਬਚਤ ਸ਼ੁਰੂ ਕਰੋ 🚀",
      body: `**ਆਪਣਾ ਭਵਿੱਖ ਤੇਜ਼ੀ ਨਾਲ ਬਣਾਓ।** ਲਚਕੀਲੇ ਡਿਪਾਜ਼ਿਟ ਵਿਕਲਪ ਅਤੇ ਵਧੀਆ ਰਿਟਰਨ ਵੇਖੋ। **ਹੁਣ ਵੇਖੋ**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "ਤੁਹਾਡੇ ਲਈ ਪ੍ਰੀਮਿਅਮ ਡਿਪਾਜ਼ਿਟ ਲਾਭ 💼",
      body: `**ਭਰੋਸੇ ਨਾਲ ਆਪਣੀ ਦੌਲਤ ਵਧਾਓ।** ਤੁਹਾਡੇ ਟੀਚਿਆਂ ਲਈ ਬਣੇ ਪ੍ਰੀਮਿਅਮ ਡਿਪਾਜ਼ਿਟ ਲਾਭ ਪ੍ਰਾਪਤ ਕਰੋ। **ਅੱਜ ਹੀ ਕਲੇਮ ਕਰੋ**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "ਤੁਹਾਡੇ ਲਈ ਖਾਸ ਡਿਪਾਜ਼ਿਟ ਆਫਰ 🤝",
      body: `**ਸਾਡੇ ਨਾਲ ਜੁੜੇ ਰਹਿਣ ਲਈ ਧੰਨਵਾਦ।** ਤੁਹਾਡੀ ਨਿੱਜੀ ਡਿਪਾਜ਼ਿਟ ਆਫਰ ਤਿਆਰ ਹੈ। **ਹੁਣ ਐਕਟੀਵੇਟ ਕਰੋ**: ${ALLOWED_URL}`,
    },
  },
  kn: {
    default: {
      subject: "ಇಂದೇ ಸ್ಮಾರ್ಟ್ ಸೇವಿಂಗ್ ಆರಂಭಿಸಿ 🚀",
      body: `**ನಿಮ್ಮ ಭವಿಷ್ಯವನ್ನು ವೇಗವಾಗಿ ನಿರ್ಮಿಸಿ.** ಲವಚಿಕ ಠೇವಣಿ ಆಯ್ಕೆಗಳು ಮತ್ತು ಉತ್ತಮ ಆದಾಯ ನೋಡಿ. **ಈಗ ನೋಡಿ**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "ನಿಮಗಾಗಿ ಪ್ರೀಮಿಯಂ ಠೇವಣಿ ಪ್ರಯೋಜನಗಳು 💼",
      body: `**ನಂಬಿಕೆಯಿಂದ ನಿಮ್ಮ ಸಂಪತ್ತು ಬೆಳೆಸಿರಿ.** ನಿಮ್ಮ ಗುರಿಗಳಿಗೆ ತಕ್ಕ ಪ್ರೀಮಿಯಂ ಠೇವಣಿ ಪ್ರಯೋಜನಗಳನ್ನು ಪಡೆಯಿರಿ. **ಇಂದೇ ಪಡೆಯಿರಿ**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "ನಿಮಗಾಗಿ ವಿಶೇಷ ಠೇವಣಿ ಆಫರ್ 🤝",
      body: `**ನಮ್ಮೊಂದಿಗೆ ಮುಂದುವರಿದಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.** ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಠೇವಣಿ ಆಫರ್ ಸಿದ್ಧವಾಗಿದೆ. **ಈಗ ಸಕ್ರಿಯಗೊಳಿಸಿ**: ${ALLOWED_URL}`,
    },
  },
  ml: {
    default: {
      subject: "ഇന്ന് തന്നെ സ്മാർട്ട് സേവിംഗ് തുടങ്ങൂ 🚀",
      body: `**നിങ്ങളുടെ ഭാവി വേഗത്തിൽ ശക്തമാക്കൂ.** ഫ്ലെക്സിബിൾ ഡെപ്പോസിറ്റ് ഓപ്ഷനുകളും നല്ല റിട്ടേണുകളും കാണൂ. **ഇപ്പോൾ കാണൂ**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "നിങ്ങൾക്കായി പ്രീമിയം ഡെപ്പോസിറ്റ് ആനുകൂല്യങ്ങൾ 💼",
      body: `**ആത്മവിശ്വാസത്തോടെ സമ്പത്ത് വളർത്തൂ.** നിങ്ങളുടെ ലക്ഷ്യങ്ങൾക്ക് അനുയോജ്യമായ പ്രീമിയം ഡെപ്പോസിറ്റ് ആനുകൂല്യങ്ങൾ നേടൂ. **ഇന്ന് തന്നെ ക്ലെയിം ചെയ്യൂ**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "നിങ്ങൾക്കായി പ്രത്യേക ഡെപ്പോസിറ്റ് ഓഫർ 🤝",
      body: `**ഞങ്ങളോടൊപ്പം തുടരുന്നതിന് നന്ദി.** നിങ്ങളുടെ വ്യക്തിഗത ഡെപ്പോസിറ്റ് ഓഫർ തയ്യാറാണ്. **ഇപ്പോൾ ആക്ടിവേറ്റ് ചെയ്യൂ**: ${ALLOWED_URL}`,
    },
  },
  bn: {
    default: {
      subject: "আজই স্মার্ট সেভিং শুরু করুন 🚀",
      body: `**আপনার ভবিষ্যৎ দ্রুত গড়ুন।** নমনীয় ডিপোজিট অপশন ও ভালো রিটার্ন দেখুন। **এখন দেখুন**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "আপনার জন্য প্রিমিয়াম ডিপোজিট সুবিধা 💼",
      body: `**আত্মবিশ্বাসের সঙ্গে সম্পদ বাড়ান।** আপনার লক্ষ্যের জন্য তৈরি প্রিমিয়াম ডিপোজিট সুবিধা নিন। **আজই ক্লেম করুন**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "আপনার জন্য বিশেষ ডিপোজিট অফার 🤝",
      body: `**আমাদের সঙ্গে থাকার জন্য ধন্যবাদ।** আপনার ব্যক্তিগত ডিপোজিট অফার প্রস্তুত। **এখন অ্যাক্টিভেট করুন**: ${ALLOWED_URL}`,
    },
  },
  ur: {
    default: {
      subject: "آج ہی اسمارٹ سیونگ شروع کریں 🚀",
      body: `**اپنا مستقبل تیزی سے مضبوط بنائیں۔** لچکدار ڈپازٹ آپشنز اور بہتر ریٹرنز دیکھیں۔ **ابھی دیکھیں**: ${ALLOWED_URL}`,
    },
    premium: {
      subject: "آپ کے لیے پریمیم ڈپازٹ فوائد 💼",
      body: `**اعتماد کے ساتھ اپنی دولت بڑھائیں۔** اپنے اہداف کے لیے بنے پریمیم ڈپازٹ فوائد حاصل کریں۔ **آج ہی کلیم کریں**: ${ALLOWED_URL}`,
    },
    existing: {
      subject: "آپ کے لیے خاص ڈپازٹ آفر 🤝",
      body: `**ہمارے ساتھ رہنے کا شکریہ۔** آپ کی ذاتی ڈپازٹ آفر تیار ہے۔ **ابھی فعال کریں**: ${ALLOWED_URL}`,
    },
  },
};

/** Deterministic copy per segment — port of generator._build_deterministic_variants, regionalized. */
function deterministicCopy(
  label: string,
  language: IndianLanguageCode,
): { subject: string; body: string } {
  const copy = CAMPAIGN_COPY[language] ?? CAMPAIGN_COPY.en;
  const l = label.toLowerCase();
  if (l.includes("high-income") || l.includes("high income")) {
    return copy.premium;
  }
  if (l.includes("existing")) {
    return copy.existing;
  }
  return copy.default;
}

/**
 * Generate one variant per planned segment (port of run_generator) + score each
 * with the heuristic predictor. Deterministic unless the optional LLM seam
 * produces usable copy.
 */
export async function generateVariants(
  segments: Omit<PipelineSegment, "predictedOpenRate" | "predictedClickRate">[],
  profilesById: Map<string, PipelineProfile>,
  brief: string,
  nextStrategy: string,
  targetLanguage: IndianLanguageCode = "en",
): Promise<{
  variants: PipelineVariant[];
  /** index-aligned predictions, also stored on each segment row. */
  segmentPredictions: { openRate: number; clickRate: number }[];
  log: StageLog;
}> {
  let llmCopy: Record<string, { subject: string; body: string }> | null = null;
  let llmUsed = false;
  const language = normalizeLanguageCode(targetLanguage);
  if (llmEnabled()) {
    llmCopy = await tryLlmCopy(segments, brief, nextStrategy, language);
    if (llmCopy) llmUsed = true;
  }

  const variants: PipelineVariant[] = [];
  const segmentPredictions: { openRate: number; clickRate: number }[] = [];

  for (const seg of segments) {
    const fromLlm = llmCopy?.[seg.label];
    const base = fromLlm ?? deterministicCopy(seg.label, language);
    const subject = enforceSubjectRules(base.subject);
    const body = enforceBodyRules(base.body);
    const hasEmoji = /\p{Extended_Pictographic}/u.test(subject + body);
    const hasUrl = URL_PATTERN.test(subject + body);
    URL_PATTERN.lastIndex = 0; // reset stateful global regex

    const segProfiles = seg.customerIds
      .map((id) => profilesById.get(id))
      .filter((p): p is PipelineProfile => !!p);

    const prediction = scoreSegment(
      segProfiles.length > 0 ? segProfiles : Array.from(profilesById.values()).slice(0, 100),
      { subject, body, hasEmoji, hasUrl },
      seg.sendTime ?? "",
    );

    variants.push({
      variantType: seg.variantType,
      subject,
      body,
      hasEmoji,
      hasUrl,
      fontStyles: { bold: true, italic: false },
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      prediction,
    });
    segmentPredictions.push({ openRate: prediction.openRate, clickRate: prediction.clickRate });
  }

  return {
    variants,
    segmentPredictions,
    log: {
      agentName: "ContentGenerator",
      step: 3,
      inputPayload: { segment_count: segments.length },
      outputPayload: { variant_count: variants.length, llm_used: llmUsed, target_language: language },
      llmReasoning: JSON.stringify({
        fallback: llmUsed ? null : "deterministic",
        target_language: language,
        variants: variants.map((v) => ({ subject: v.subject, has_url: v.hasUrl })),
      }),
    },
  };
}

async function tryLlmCopy(
  segments: { label: string }[],
  brief: string,
  nextStrategy: string,
  targetLanguage: IndianLanguageCode,
): Promise<Record<string, { subject: string; body: string }> | null> {
  const text = await chat([
    {
      role: "system",
      content:
        "You are the Content Generator. Create one message variant per segment. " +
        `${languageInstruction(targetLanguage)} ` +
        `subject: text+emoji only <=200 chars no URL. body: plain text + optional emoji + the URL ${ALLOWED_URL}, <=5000 chars, no HTML. ` +
        'Output JSON only: {"variants":[{"label":"<segment label>","subject":"...","body":"..."}]}',
    },
    {
      role: "user",
      content:
        `Campaign brief: ${brief}${nextStrategy ? `\n\nOPTIMIZER FEEDBACK: ${nextStrategy}` : ""}\n\n` +
        `Segments:\n${JSON.stringify(segments.map((s) => s.label), null, 2)}`,
    },
  ]);
  if (!text) return null;
  try {
    const parsed = JSON.parse(stripCodeFences(text)) as { variants?: unknown };
    if (!Array.isArray(parsed.variants)) return null;
    const map: Record<string, { subject: string; body: string }> = {};
    for (const v of parsed.variants as Record<string, unknown>[]) {
      if (typeof v.label === "string" && typeof v.subject === "string" && typeof v.body === "string") {
        map[v.label] = { subject: v.subject, body: v.body };
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

// ── Heuristic engagement predictor (port of ml/engagement_predictor.py) ───────

function hasEmojiInText(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

/** Predict open/click for one customer × one variant (port of calculate_engagement_score). */
export function calculateEngagementScore(
  p: PipelineProfile,
  variant: { subject: string | null; body: string; hasEmoji: boolean; hasUrl: boolean },
  sendTime: string,
): { openRate: number; clickRate: number; weightedScore: number; signals: string[] } {
  const signals: string[] = [];
  let sendHour = -1;
  try {
    sendHour = parseInt(sendTime.split(" ")[1].split(":")[0], 10);
    if (!Number.isFinite(sendHour)) sendHour = -1;
  } catch {
    sendHour = -1;
  }

  const age = safeInt(p.age);
  const gender = String(p.gender ?? "").trim();
  const income = safeInt(p.monthlyIncome);
  const credit = safeInt(p.creditScore);
  const kyc = String(p.kycStatus ?? "N").trim();
  const app = String(p.appInstalled ?? "N").trim();
  const existing = String(p.existingCustomer ?? "N").trim();
  const social = String(p.socialMediaActive ?? "N").trim();
  const occ = String(p.occupationType ?? "").trim();
  const city = String(p.city ?? "").trim();

  const subject = String(variant.subject ?? "");
  const body = String(variant.body ?? "");
  const hasEmoji = !!variant.hasEmoji;
  const hasUrl = !!variant.hasUrl;

  // OPEN RATE
  let open = 0.06;
  if (app === "Y") open += 0.1;
  if (existing === "Y") open += 0.08;
  if (kyc === "Y") open += 0.06;
  if (social === "Y") open += 0.05;
  if (gender.toLowerCase() === "female") open += 0.03;
  if (age !== null && age >= 25 && age <= 45) open += 0.02;
  if (occ.toLowerCase() === "full-time") open += 0.02;
  if (TIER1_CITIES_PRED.has(city.toLowerCase()) || TIER1_CITIES_PRED.has(city)) open += 0.02;
  if (income !== null && income > 300_000) open += 0.015;
  if (credit !== null && credit > 650) open += 0.01;
  if (HIGH_ENGAGEMENT_HOURS.has(sendHour)) open += 0.03;
  else if (NIGHT_HOURS.has(sendHour)) open -= 0.02;
  if (hasEmojiInText(subject)) open += 0.02;
  if (subject.length >= 30 && subject.length <= 60) open += 0.01;
  else if (subject.length > 100) open -= 0.01;
  open = round4(Math.min(0.4, Math.max(0, open)));

  // CLICK RATE
  let click = 0.03;
  if (hasUrl) click += 0.08;
  if (existing === "Y") click += 0.06;
  if (social === "Y") click += 0.04;
  if (kyc === "Y") click += 0.04;
  if (income !== null && income > 400_000) click += 0.03;
  if (age !== null && age >= 18 && age <= 35) click += 0.02;
  if (app === "Y") click += 0.02;
  if (hasEmoji) click += 0.015;
  if (body.length > 0 && body.length < 400) click += 0.01;
  if (TIER1_CITIES_PRED.has(city.toLowerCase()) || TIER1_CITIES_PRED.has(city)) click += 0.01;
  click = round4(Math.min(0.2, Math.max(0, click)));

  const weighted = round4(click * 0.7 + open * 0.3);
  return { openRate: open, clickRate: click, weightedScore: weighted, signals };
}

/** Aggregate per-customer scores into a segment mean (port of score_segment). */
export function scoreSegment(
  profiles: PipelineProfile[],
  variant: { subject: string | null; body: string; hasEmoji: boolean; hasUrl: boolean },
  sendTime: string,
): Prediction {
  if (profiles.length === 0) {
    return { openRate: 0, clickRate: 0, weightedScore: 0, confidence: "Low", signals: [] };
  }
  let sumOpen = 0;
  let sumClick = 0;
  for (const p of profiles) {
    const s = calculateEngagementScore(p, variant, sendTime);
    sumOpen += s.openRate;
    sumClick += s.clickRate;
  }
  const meanOpen = round4(sumOpen / profiles.length);
  const meanClick = round4(sumClick / profiles.length);
  const weighted = round4(meanClick * 0.7 + meanOpen * 0.3);
  const confidence: Prediction["confidence"] =
    meanOpen > 0.2 ? "High" : meanOpen > 0.12 ? "Medium" : "Low";
  return { openRate: meanOpen, clickRate: meanClick, weightedScore: weighted, confidence, signals: [] };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Orchestrator: profiler → planner → creative (to HITL pause) ──────────────

/**
 * Run the pipeline from profiling through creative generation, stopping at the
 * HITL pause (status → pending_approval). Pure: returns the data to persist.
 *
 * Mirrors run_campaign_workflow up to _hitl_pause_node. The analyst/optimizer
 * loop runs post-approval (see analyzeAndOptimize / actions.approveCampaign).
 */
export async function runPipelineToApproval(args: {
  profiles: PipelineProfile[];
  brief: string;
  rejectionFeedback?: string | null;
  nextStrategy?: string;
  targetLanguage?: IndianLanguageCode | null;
  now?: Date;
}): Promise<PipelineOutput> {
  const now = args.now ?? new Date();
  const logs: StageLog[] = [];
  const targetLanguage = normalizeLanguageCode(args.targetLanguage);

  // Stage 0 — Profiler (deterministic tags/taxonomy).
  const { tagsByCustomer, taxonomy } = deriveTagsAndTaxonomy(args.profiles);
  const taggedProfiles = args.profiles.map((p) => ({
    ...p,
    segmentTag: tagsByCustomer[p.customerId] ?? "unclassified",
  }));
  logs.push({
    agentName: "CustomerProfiler",
    step: 1,
    inputPayload: { total_customers: args.profiles.length },
    outputPayload: { segment_count: Object.keys(taxonomy).length, taxonomy },
    llmReasoning: JSON.stringify({ fallback: "deterministic", taxonomy }),
  });

  // Stage 1 — Planner.
  const { segments: plannedSegments, log: planLog } = await planSegments(
    taggedProfiles,
    args.brief,
    args.rejectionFeedback ?? null,
    now,
  );
  logs.push(planLog);

  // Stage 2 — Creative + heuristic predictor.
  const profilesById = new Map(taggedProfiles.map((p) => [p.customerId, p]));
  const { variants, segmentPredictions, log: genLog } = await generateVariants(
    plannedSegments,
    profilesById,
    args.brief,
    args.nextStrategy ?? "",
    targetLanguage,
  );
  logs.push(genLog);

  const segments: PipelineSegment[] = plannedSegments.map((s, i) => ({
    ...s,
    predictedOpenRate: segmentPredictions[i]?.openRate ?? null,
    predictedClickRate: segmentPredictions[i]?.clickRate ?? null,
  }));

  return { segments, variants, logs, llmUsed: llmEnabled() };
}

// ── Analyst + Optimizer (post-execution loop) ────────────────────────────────

export interface SegmentMetricsInput {
  segmentId: string;
  segmentLabel: string;
  variants: { variantId: string; totalSent: number; openCount: number; clickCount: number }[];
}

export interface AnalysisResult {
  analysisSummary: string;
  segmentResults: Record<
    string,
    {
      winnerVariantId: string | null;
      openRate: number;
      clickRate: number;
      weightedScore: number;
      weaknesses: string[];
      recommendations: string[];
    }
  >;
}

/** Rule-based analyst (port of analyst._build_fallback_analysis + weighting). */
export function analyzeMetrics(segments: SegmentMetricsInput[]): {
  analysis: AnalysisResult;
  log: StageLog;
} {
  const segmentResults: AnalysisResult["segmentResults"] = {};
  for (const seg of segments) {
    let best: { variantId: string; openRate: number; clickRate: number; weighted: number } | null = null;
    for (const v of seg.variants) {
      const openRate = v.totalSent ? round4(v.openCount / v.totalSent) : 0;
      const clickRate = v.totalSent ? round4(v.clickCount / v.totalSent) : 0;
      const weighted = round4(clickRate * 0.7 + openRate * 0.3);
      if (!best || weighted > best.weighted) {
        best = { variantId: v.variantId, openRate, clickRate, weighted };
      }
    }
    if (best) {
      segmentResults[seg.segmentId] = {
        winnerVariantId: best.variantId,
        openRate: best.openRate,
        clickRate: best.clickRate,
        weightedScore: best.weighted,
        weaknesses: best.openRate < 0.1 ? ["low open rate"] : best.clickRate < 0.05 ? ["low click rate"] : [],
        recommendations:
          best.openRate < 0.1
            ? ["Improve subject line: shorten to 30-50 chars, add a power emoji at start."]
            : best.clickRate < 0.05
              ? ["Move URL to the first third of the body; use a stronger imperative CTA."]
              : ["Scale: target similar customers; preserve top-performing characteristics."],
      };
    }
  }
  return {
    analysis: { analysisSummary: "Rule-based performance analysis", segmentResults },
    log: {
      agentName: "PerformanceAnalyst",
      step: 4,
      inputPayload: { segment_count: segments.length },
      outputPayload: { analysis_summary: "Rule-based performance analysis", segment_results: segmentResults },
      llmReasoning: JSON.stringify({ fallback: "deterministic", segment_results: segmentResults }),
    },
  };
}

/** Optimizer next-strategy (port of run_optimizer deterministic branch). */
export function optimizeStrategy(analysis: AnalysisResult, iteration: number): {
  nextStrategy: string;
  log: StageLog;
} {
  const lows = Object.values(analysis.segmentResults).filter((r) => r.openRate < 0.1 || r.clickRate < 0.05);
  const nextStrategy =
    lows.length > 0
      ? "Improve subject lines and add stronger CTAs. Move URL earlier in body. Shorten body below 300 chars."
      : "Scale top-performing segments by targeting similar customers; preserve winning subject + CTA style.";
  return {
    nextStrategy,
    log: {
      agentName: "Optimizer",
      step: 5,
      inputPayload: { iteration },
      outputPayload: { optimization_summary: "Auto-optimizer", iteration, next_strategy: nextStrategy },
      llmReasoning: JSON.stringify({ next_strategy: nextStrategy }),
    },
  };
}

/** Reported model id for traces (deterministic ⇒ "deterministic"). */
export function pipelineModelLabel(): string {
  return llmEnabled() ? llmModel() : "deterministic";
}
