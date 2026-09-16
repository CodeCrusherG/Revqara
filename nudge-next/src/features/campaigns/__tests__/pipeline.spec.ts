/**
 * Deterministic pipeline stub tests — the campaign flow must produce sensible
 * segments / variants / predictions with NO LLM (LLM_ENABLED unset), matching
 * the Python deterministic fallback contract.
 *
 * Covers: profiler tagging, 100%-coverage segment assignment, one variant per
 * segment, content-rule enforcement (URL allowed in body, never in subject),
 * heuristic predictions in range, and the analyst/optimizer rule-based pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  analyzeMetrics,
  calculateEngagementScore,
  deriveTagsAndTaxonomy,
  optimizeStrategy,
  runPipelineToApproval,
  scoreSegment,
  type PipelineProfile,
} from "../pipeline";

// Force the deterministic path regardless of ambient env.
beforeEach(() => {
  vi.stubEnv("LLM_ENABLED", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function cohort(): PipelineProfile[] {
  return [
    {
      customerId: "C1",
      age: 28,
      city: "Mumbai",
      monthlyIncome: 90_000,
      existingCustomer: "N",
      socialMediaActive: "Y",
      occupationType: "full-time",
      appInstalled: "Y",
      kycStatus: "Y",
    },
    {
      customerId: "C2",
      age: 41,
      city: "Pune",
      monthlyIncome: 350_000,
      existingCustomer: "N",
      socialMediaActive: "Y",
      occupationType: "salaried",
      appInstalled: "Y",
      kycStatus: "Y",
    },
    {
      customerId: "C3",
      age: 60,
      city: "Indore",
      monthlyIncome: 40_000,
      existingCustomer: "Y",
      socialMediaActive: "N",
      occupationType: "retired",
      appInstalled: "N",
      kycStatus: "N",
    },
  ];
}

describe("deriveTagsAndTaxonomy", () => {
  it("assigns deterministic tags + a taxonomy bucket per tag", () => {
    const { tagsByCustomer, taxonomy } = deriveTagsAndTaxonomy(cohort());
    expect(tagsByCustomer.C1).toContain("young");
    expect(tagsByCustomer.C3).toContain("existing");
    // every tag has a taxonomy entry with a count and sample ids
    for (const [tag, info] of Object.entries(taxonomy)) {
      expect(info.count).toBeGreaterThan(0);
      expect(info.sampleCustomerIds.length).toBeGreaterThan(0);
      expect(tag.length).toBeGreaterThan(0);
    }
  });
});

describe("runPipelineToApproval (deterministic)", () => {
  it("produces 3 segments, one variant each, with 100% coverage", async () => {
    const profiles = cohort();
    const out = await runPipelineToApproval({
      profiles,
      brief: "Grow deposits among digitally active customers.",
    });

    expect(out.llmUsed).toBe(false);
    expect(out.segments).toHaveLength(3);
    expect(out.variants).toHaveLength(3);

    // Every customer is assigned exactly once (100% coverage, no overlap).
    const assigned = out.segments.flatMap((s) => s.customerIds);
    expect(new Set(assigned).size).toBe(profiles.length);
    expect(assigned.sort()).toEqual(["C1", "C2", "C3"]);
  });

  it("enforces content rules: URL allowed in body, never in subject", async () => {
    const out = await runPipelineToApproval({
      profiles: cohort(),
      brief: "Premium deposit push.",
    });
    for (const v of out.variants) {
      expect(v.subject ?? "").not.toMatch(/https?:\/\//);
      expect(v.body.length).toBeGreaterThan(0);
      expect(v.body.length).toBeLessThanOrEqual(5000);
    }
  });

  it("attaches an in-range heuristic prediction to each segment", async () => {
    const out = await runPipelineToApproval({
      profiles: cohort(),
      brief: "Test predictions.",
    });
    for (const s of out.segments) {
      expect(s.predictedOpenRate).not.toBeNull();
      expect(s.predictedClickRate).not.toBeNull();
      expect(s.predictedOpenRate!).toBeGreaterThanOrEqual(0);
      expect(s.predictedOpenRate!).toBeLessThanOrEqual(0.4);
      expect(s.predictedClickRate!).toBeLessThanOrEqual(0.2);
    }
  });

  it("emits the 3 pre-pause agent logs (profiler, planner, creative)", async () => {
    const out = await runPipelineToApproval({
      profiles: cohort(),
      brief: "Log check.",
    });
    expect(out.logs.map((l) => l.agentName)).toEqual([
      "CustomerProfiler",
      "CampaignPlanner",
      "ContentGenerator",
    ]);
  });

  it("generates deterministic WhatsApp copy in the selected regional language", async () => {
    const out = await runPipelineToApproval({
      profiles: cohort(),
      brief: "Run a deposit campaign in Tamil.",
      targetLanguage: "ta",
    });

    expect(out.variants[0].subject ?? "").toMatch(/[\u0B80-\u0BFF]/);
    expect(out.variants[0].body).toContain("https://superbfsi.com/xdeposit/explore/");
    expect(out.logs[2].llmReasoning).toContain('"target_language":"ta"');
  });
});

describe("predictor bounds", () => {
  it("clamps open/click within the documented caps", () => {
    const p = cohort()[1];
    const s = calculateEngagementScore(
      p,
      { subject: "Hi 🚀", body: "Offer https://superbfsi.com/x/", hasEmoji: true, hasUrl: true },
      "01:01:30 12:00:00",
    );
    expect(s.openRate).toBeGreaterThanOrEqual(0);
    expect(s.openRate).toBeLessThanOrEqual(0.4);
    expect(s.clickRate).toBeLessThanOrEqual(0.2);
  });

  it("returns Low confidence + zeros for an empty segment", () => {
    const pred = scoreSegment([], { subject: "x", body: "y", hasEmoji: false, hasUrl: false }, "01:01:30 09:00:00");
    expect(pred).toEqual({ openRate: 0, clickRate: 0, weightedScore: 0, confidence: "Low", signals: [] });
  });
});

describe("analyst + optimizer (rule-based)", () => {
  it("picks the highest weighted variant and proposes a next strategy", () => {
    const { analysis } = analyzeMetrics([
      {
        segmentId: "S1",
        segmentLabel: "A",
        variants: [
          { variantId: "V1", totalSent: 100, openCount: 5, clickCount: 1 },
          { variantId: "V2", totalSent: 100, openCount: 30, clickCount: 12 },
        ],
      },
    ]);
    expect(analysis.segmentResults.S1.winnerVariantId).toBe("V2");

    const { nextStrategy } = optimizeStrategy(analysis, 1);
    expect(typeof nextStrategy).toBe("string");
    expect(nextStrategy.length).toBeGreaterThan(0);
  });
});
