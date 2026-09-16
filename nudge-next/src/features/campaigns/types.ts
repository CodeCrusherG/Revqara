/**
 * Campaign domain types (serializable, safe to import from client components).
 *
 * Mirrors the agentic-campaign Appwrite collections (campaigns / segments /
 * variants / customer_profiles / agent_logs) and the UX shape of the old
 * frontend BriefPage / ApprovalPage / DashboardPage + their components.
 *
 * Ground truth: backend/workflows/{langgraph_flow,state}.py, backend/agents/*,
 * backend/api/{campaigns,approval,analytics}.py.
 */

import type { CampaignStatus } from "@/types/appwrite";
import type { IndianLanguageCode } from "@/lib/india-languages";

export type { CampaignStatus };

/** The 5 agentic stages, in pipeline order (Profiler → Optimizer). */
export const AGENT_NAMES = [
  "CustomerProfiler",
  "CampaignPlanner",
  "ContentGenerator",
  "PerformanceAnalyst",
  "Optimizer",
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** Heuristic engagement prediction for a segment+variant (glass-box). */
export interface Prediction {
  openRate: number;
  clickRate: number;
  weightedScore: number;
  confidence: "High" | "Medium" | "Low";
  signals: string[];
}

export interface VariantView {
  id: string;
  segmentId: string;
  externalCampaignId: string | null;
  subject: string | null;
  body: string;
  hasEmoji: boolean;
  hasUrl: boolean;
  fontStyles: Record<string, unknown> | null;
  sentCount: number;
  openCount: number;
  clickCount: number;
}

export interface SegmentView {
  id: string;
  campaignId: string;
  label: string;
  criteria: Record<string, unknown>;
  customerIds: string[];
  sendTime: string | null;
  predictedOpenRate: number | null;
  predictedClickRate: number | null;
  variants: VariantView[];
}

export interface AgentLogView {
  id: string;
  agentName: string;
  step: number | null;
  inputPayload: unknown;
  outputPayload: unknown;
  llmReasoning: string | null;
  createdAt: string;
}

/** Lightweight campaign summary (list + brief-page recents). */
export interface CampaignSummary {
  id: string;
  name: string | null;
  status: CampaignStatus;
  brief: string;
  createdAt: string;
  rejectionFeedback: string | null;
  segmentCount: number;
  variantCount: number;
  hasPendingReview: boolean;
}

/** Full campaign detail (approval + dashboard). */
export interface CampaignDetail {
  id: string;
  name: string | null;
  status: CampaignStatus;
  brief: string;
  createdAt: string;
  scheduledAt: string | null;
  rejectionFeedback: string | null;
  segments: SegmentView[];
  agentLogs: AgentLogView[];
}

/** Per-variant cached metrics (dashboard chart). */
export interface VariantMetric {
  variantId: string;
  externalCampaignId: string | null;
  segmentLabel: string;
  totalSent: number;
  openCount: number;
  clickCount: number;
  openRate: number;
  clickRate: number;
  weightedScore: number;
}

/** Campaign funnel analytics (parity with /campaigns/{id}/analytics). */
export interface CampaignAnalytics {
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  clicked: number;
  replies: number;
  replyRate: number;
  readRate: number;
  unsubscribes: number;
  leads: number;
  estimatedCostInr: number;
  currency: "INR";
}

export interface GenerateCampaignInput {
  brief: string;
  name?: string | null;
  targetListId?: string | null;
  templateId?: string | null;
  targetLanguage?: IndianLanguageCode | null;
  /** ISO 8601; a future datetime schedules the campaign instead of running now. */
  scheduledAt?: string | null;
}

export interface GenerateCampaignResult {
  campaignId: string;
  status: CampaignStatus;
}
