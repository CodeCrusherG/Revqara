/**
 * Port of `backend/tests/test_vertical_transitions.py`.
 *
 * Same graph, vertical-specific pipeline transitions — asserted against the TS
 * port via `simulateInbound` (the AI-graph slice of `process_inbound_message`).
 */
import { describe, expect, it } from "vitest";
import { simulateInbound } from "./helpers";

describe("vertical stage transitions", () => {
  const cases: Array<[string, string, string]> = [
    ["coaching", "fees kitna hai for weekend batch?", "fee_discussed"],
    ["coaching", "JEE Main 2027 class 11 offline batch details", "batch_matched"],
    ["coaching", "NEET dropper batch offline available hai?", "batch_matched"],
    ["coaching", "Class 6 to 8 foundation course details", "course_identified"],
    ["coaching", "Need class 9-10 boards and olympiad coaching", "course_identified"],
    ["coaching", "UPSC prelims 2027 ke liye counselling book karni hai", "counselling_booked"],
    ["coaching", "SSC CGL aur CAT courses ke details share karo", "course_identified"],
    ["coaching", "Can I book a demo class this Saturday?", "demo_scheduled"],
    ["coaching", "Scholarship test details chahiye", "scholarship_review"],
    ["real_estate", "Book a site visit for the 3BHK on Sunday", "visit_scheduled"],
    ["clinic", "I want an appointment tomorrow morning", "appointment_scheduled"],
    ["b2b", "Please send me a quotation for monthly supply", "quote_sent"],
    ["political_party", "Ward 18 mein drainage issue hai, complaint register karna hai", "issue_logged"],
    ["political_party", "I want to volunteer for the Sunday booth meeting", "volunteer_interested"],
    ["political_party", "Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai", "volunteer_interested"],
    ["political_party", "Please route this to mandal office for ward 12", "constituency_mapped"],
    ["political_party", "Need help with sadasyata membership update", "membership_support"],
    ["restaurant", "Table for 4 this Saturday at 8pm?", "reservation_booked"],
    ["restaurant", "What's on the menu and price for a veg thali?", "menu_shared"],
    ["restaurant", "Need catering for a 200 guest wedding", "catering_quoted"],
    ["restaurant", "I want home delivery, parcel for two", "order_placed"],
    ["gym", "What are your monthly membership plans and price?", "plan_discussed"],
    ["gym", "Can I book a free trial session this weekend?", "trial_booked"],
    ["gym", "I want a personal trainer and diet plan for weight loss", "pt_consultation"],
    ["gym", "I want to renew my membership", "renewal_due"],
    ["automobile", "Can I book a test drive for the Creta this Sunday?", "test_drive_booked"],
    ["automobile", "What's the on-road price and EMI for the petrol variant?", "quote_shared"],
    ["automobile", "My car AC is not cooling, need a service appointment", "service_booked"],
    ["automobile", "Show me the SUV models and features available", "model_shared"],
    ["insurance", "I need a term insurance plan for my family", "needs_assessed"],
    ["insurance", "What's the premium for 1 crore health cover?", "quote_shared"],
    ["insurance", "Can you recommend the best plan: term vs ULIP?", "plan_recommended"],
    ["insurance", "I want to renew my motor policy before it lapses", "renewal_due"],
  ];

  it.each(cases)("%s: %s -> %s", async (vertical, text, expectedStage) => {
    const result = await simulateInbound(vertical, text);
    expect(result.status).toBe("processed");
    expect(result.stage_before).toBe("new");
    expect(result.stage_after).toBe(expectedStage);
  });
});

describe("ai_trace honesty", () => {
  it("is honest about deterministic fallback (no fabricated confidence)", async () => {
    const result = await simulateInbound("coaching", "fees kitna hai for weekend batch?");
    const trace = result.trace!;
    // No LLM reachable in tests → deterministic fallback, no fabricated confidence.
    expect(trace.confidence).toBeNull();
    expect(trace.confidence_source).toBe("deterministic");
    expect(trace.fallback_used).toBe(true);
    expect(trace.model_used).toBeNull();
    expect(trace.graph_version).toBeTruthy();
    expect(trace.intent).toBe("PRICE_QUERY");
    expect(trace.stage_before).toBe("new");
    expect(trace.stage_after).toBe("fee_discussed");
  });
});

describe("coaching: other exam families route to course or batch", () => {
  const texts = [
    "Need GATE and CUET course details",
    "CLAT online batch for 2027 attempt",
    "Banking IBPS and SBI PO classes available?",
    "NDA CDS AFCAT defence coaching info",
    "Other exams ke liye weekend batch hai kya?",
  ];

  it.each(texts)("%s", async (text) => {
    const result = await simulateInbound("coaching", text);
    expect(result.status).toBe("processed");
    expect(["course_identified", "batch_matched"]).toContain(result.stage_after);
  });
});

describe("risk escalations", () => {
  it("coaching refund/complaint escalates + handoff", async () => {
    const result = await simulateInbound("coaching", "Worst institute, refund chahiye right now");
    expect(result.status).toBe("processed");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });

  it("political sensitive identity targeting escalates + handoff", async () => {
    const result = await simulateInbound(
      "political_party",
      "Can you target voters by caste and religion for this election?",
    );
    expect(result.status).toBe("processed");
    expect(result.stage_before).toBe("new");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });

  it("political party-specific targeting request escalates + handoff", async () => {
    const result = await simulateInbound(
      "political_party",
      "Make a BJP caste wise booth campaign list for targeting",
    );
    expect(result.status).toBe("processed");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });

  const religionCasteTexts = [
    "Need outreach plan for Hindu, Muslim, Sikh and Christian communities",
    "Can we segment SC ST OBC and general caste voters?",
    "Jain community event targeting for elections",
    "Parsi and Buddhist families ko separate message bhejna hai",
  ];

  it.each(religionCasteTexts)("political religion/caste term escalates: %s", async (text) => {
    const result = await simulateInbound("political_party", text);
    expect(result.status).toBe("processed");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });

  it("political short identity terms do NOT false-match inside words (sc/st in 'station'/'register')", async () => {
    const result = await simulateInbound(
      "political_party",
      "Road issue near station, please register this for ward 3",
    );
    expect(result.status).toBe("processed");
    expect(result.stage_after).toBe("issue_logged");
    expect(result.handoff).toBe(false);
  });

  const newVerticalRisk: Array<[string, string]> = [
    ["restaurant", "Found a hair in my food, worst service, I want a refund"],
    ["gym", "I have a knee injury and severe chest pain during workout"],
    ["automobile", "Worst dealer, manufacturing defect in my new car, I want a refund"],
    ["insurance", "My health insurance claim was rejected and I want to file a dispute"],
  ];

  it.each(newVerticalRisk)("%s risk topic escalates + handoff", async (vertical, text) => {
    const result = await simulateInbound(vertical, text);
    expect(result.status).toBe("processed");
    expect(result.stage_before).toBe("new");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });

  it("insurance guaranteed-return request escalates + handoff (IRDAI)", async () => {
    const result = await simulateInbound(
      "insurance",
      "Can you promise me guaranteed returns and assured return on this plan?",
    );
    expect(result.status).toBe("processed");
    expect(result.stage_after).toBe("escalated");
    expect(result.handoff).toBe(true);
  });
});
