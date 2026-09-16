/**
 * Port of `backend/tests/test_edge_cases.py`.
 *
 * Graph edge cases: unknown vertical, empty/unsupported messages, transition
 * guards, opt-out, meaningful-text — plus extra unit coverage for the
 * byte-for-byte behaviors the plan calls out (intent rule order incl. the
 * duplicate PAYMENT_QUERY, `_hasKeyword` boundary matching, deterministic
 * `confidence:null`).
 */
import { describe, expect, it, vi } from "vitest";
import { getPack, listVerticals } from "../packs";
import { canAiUpdateStage, isMeaningfulText, isOptOut } from "../guards";
import { classifyIntent, hasKeyword } from "../intent";
import { stageFor } from "../decide";
import { runMessageGraph, GRAPH_VERSION } from "../graph";
import { simulateInbound } from "./helpers";

describe("unknown vertical fallback", () => {
  it("falls back to custom for unknown / null / empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getPack("nonsense_vertical").vertical).toBe("custom");
    expect(getPack(null).vertical).toBe("custom");
    expect(getPack("").vertical).toBe("custom");
    expect(getPack(undefined).vertical).toBe("custom");
    // unknown (non-empty) logs a warning; null/empty are silent.
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("unknown vertical workspace does not crash (custom pack handles it)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await simulateInbound("nonsense_vertical", "hello, what are your prices?");
    expect(result.status).toBe("processed");
    warn.mockRestore();
  });
});

describe("empty / unsupported messages", () => {
  it("whitespace-only message asks for clarification (1 reply enqueued, no lead guesswork)", async () => {
    const result = await simulateInbound("salon", "   ");
    expect(result.status).toBe("unsupported_message");
    expect(result.enqueued).toBe(1);
  });

  it("media-only (null text) message is handled", async () => {
    const result = await simulateInbound("salon", null);
    expect(result.status).toBe("unsupported_message");
  });

  it("unsupported message does NOT enqueue when auto-reply off or bot disabled", async () => {
    expect((await simulateInbound("salon", "   ", { autoReply: false })).enqueued).toBe(0);
    expect((await simulateInbound("salon", "   ", { botEnabled: false })).enqueued).toBe(0);
  });
});

describe("transition guard (pure unit)", () => {
  it("blocks human-owned", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("new", "fee_discussed", pack, { humanOwned: true, intent: "PRICE_QUERY" })).toBe(false);
  });

  it("blocks terminal state", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("enrolled", "fee_discussed", pack, { humanOwned: false, intent: "PRICE_QUERY" })).toBe(false);
  });

  it("blocks resolved public-office case", () => {
    const pack = getPack("political_party");
    expect(canAiUpdateStage("resolved", "follow_up", pack, { humanOwned: false, intent: "NEW_LEAD" })).toBe(false);
  });

  it("blocks regression (fee_discussed idx5 -> course_identified idx1)", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("fee_discussed", "course_identified", pack, { humanOwned: false, intent: "NEW_LEAD" })).toBe(false);
  });

  it("allows forward move", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("new", "fee_discussed", pack, { humanOwned: false, intent: "PRICE_QUERY" })).toBe(true);
  });

  it("revives 'lost' only on a fresh buying intent", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("lost", "fee_discussed", pack, { humanOwned: false, intent: "PRICE_QUERY" })).toBe(true);
    expect(canAiUpdateStage("lost", "fee_discussed", pack, { humanOwned: false, intent: "UNKNOWN" })).toBe(false);
  });

  it("blocks no-op (proposed == current) and null proposed", () => {
    const pack = getPack("coaching");
    expect(canAiUpdateStage("new", "new", pack, { humanOwned: false, intent: "NEW_LEAD" })).toBe(false);
    expect(canAiUpdateStage("new", null, pack, { humanOwned: false, intent: "NEW_LEAD" })).toBe(false);
  });
});

describe("opt-out detection", () => {
  it("matches clear opt-out, rejects CANCEL-intent and questions", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("unsubscribe please")).toBe(true);
    expect(isOptOut("don't message me again")).toBe(true);
    expect(isOptOut("cancel")).toBe(true);
    // "cancel my booking" is a CANCEL intent, NOT an opt-out.
    expect(isOptOut("cancel my booking for tomorrow")).toBe(false);
    expect(isOptOut("what are your prices?")).toBe(false);
    expect(isOptOut(null)).toBe(false);
    expect(isOptOut("")).toBe(false);
  });
});

describe("meaningful text", () => {
  it("true for real text, false for whitespace/null", () => {
    expect(isMeaningfulText("hi")).toBe(true);
    expect(isMeaningfulText("   ")).toBe(false);
    expect(isMeaningfulText(null)).toBe(false);
    expect(isMeaningfulText(undefined)).toBe(false);
  });
});

// ── Extra coverage for byte-for-byte behaviors the plan calls out ────────────

describe("hasKeyword boundary matching", () => {
  it("short alnum tokens do not match inside words", () => {
    // 'sc'/'st' must NOT match inside 'street'/'station'/'worst'/'register'.
    expect(hasKeyword("road near the station", "st")).toBe(false);
    expect(hasKeyword("please register this", "st")).toBe(false);
    expect(hasKeyword("on the street corner", "st")).toBe(false);
    expect(hasKeyword("worst service", "st")).toBe(false);
    expect(hasKeyword("the scheme is good", "sc")).toBe(false);
  });

  it("short alnum tokens match as standalone words", () => {
    expect(hasKeyword("we serve sc st obc voters", "sc")).toBe(true);
    expect(hasKeyword("we serve sc st obc voters", "st")).toBe(true);
  });

  it("multi-word / non-alnum phrases match as substrings", () => {
    expect(hasKeyword("can you talk to someone for me", "talk to someone")).toBe(true);
    expect(hasKeyword("model code of conduct query", "model code")).toBe(true);
    // 'pay ' (with trailing space) is a substring, not a boundary token.
    expect(hasKeyword("i want to pay now", "pay ")).toBe(true);
  });

  it("empty keyword never matches", () => {
    expect(hasKeyword("anything", "")).toBe(false);
    expect(hasKeyword("anything", "   ")).toBe(false);
  });
});

describe("classifyIntent rule order", () => {
  it("first matching rule wins in priority order", () => {
    expect(classifyIntent("STOP")[0]).toBe("OPT_OUT");
    expect(classifyIntent("can I talk to a human")[0]).toBe("HUMAN_REQUEST");
    expect(classifyIntent("this is the worst service")[0]).toBe("COMPLAINT");
    expect(classifyIntent("how do I make a payment")[0]).toBe("PAYMENT_QUERY");
    expect(classifyIntent("I want to reschedule my appointment")[0]).toBe("RESCHEDULE");
    expect(classifyIntent("please cancel")[0]).toBe("CANCEL");
    expect(classifyIntent("what is the price")[0]).toBe("PRICE_QUERY");
    expect(classifyIntent("can I book a slot")[0]).toBe("BOOKING_QUERY");
    expect(classifyIntent("not interested thanks")[0]).toBe("NOT_INTERESTED");
  });

  it("the duplicate PAYMENT_QUERY 'pay ' rule fires after BOOKING_QUERY", () => {
    // "pay " only appears in the SECOND PAYMENT_QUERY rule, which sits after
    // BOOKING_QUERY. A message with 'pay ' but no booking keyword classifies
    // as PAYMENT_QUERY.
    expect(classifyIntent("i want to pay now")[0]).toBe("PAYMENT_QUERY");
  });

  it("RESCHEDULE outranks CANCEL for 'change my appointment'", () => {
    expect(classifyIntent("I want to change my appointment")[0]).toBe("RESCHEDULE");
  });

  it("falls back to NEW_LEAD on positive cues, else UNKNOWN", () => {
    expect(classifyIntent("hi")).toEqual(["NEW_LEAD", 0.55]);
    expect(classifyIntent("I am interested")).toEqual(["NEW_LEAD", 0.55]);
    expect(classifyIntent("xyzzy plugh")).toEqual(["UNKNOWN", 0.3]);
    expect(classifyIntent("")).toEqual(["UNKNOWN", 0.3]);
  });

  it("first-match wins on PRICE_QUERY confidence", () => {
    const [intent, conf] = classifyIntent("how much does it cost");
    expect(intent).toBe("PRICE_QUERY");
    expect(conf).toBe(0.75);
  });
});

describe("stageFor precedence", () => {
  it("keyword_stage_hints take precedence over hardcoded wanted map", () => {
    const pack = getPack("coaching");
    // 'fee' keyword hint -> fee_discussed (precedence #1).
    expect(stageFor("PRICE_QUERY", pack, "fees kitna hai for weekend batch?")).toBe("fee_discussed");
  });

  it("returns null when nothing matches", () => {
    const pack = getPack("custom");
    expect(stageFor("UNKNOWN", pack, "completely unrelated text")).toBeNull();
  });
});

describe("deterministic runMessageGraph", () => {
  it("runs with zero LLM env: confidence null, deterministic source, fallback used", async () => {
    const pack = getPack("coaching");
    const r = await runMessageGraph({ pack, messageText: "fees kitna hai for weekend batch?" });
    expect(r.confidence).toBeNull();
    expect(r.confidence_source).toBe("deterministic");
    expect(r.fallback_used).toBe(true);
    expect(r.model_used).toBeNull();
    expect(r.graph_version).toBe("0.6.1");
    expect(GRAPH_VERSION).toBe("0.6.1");
    expect(r.intent).toBe("PRICE_QUERY");
    expect(r.vertical).toBe("coaching");
  });

  it("handoff intents set next_action=handoff and a reason", async () => {
    const pack = getPack("coaching");
    const r = await runMessageGraph({ pack, messageText: "I want to talk to a human" });
    expect(r.intent).toBe("HUMAN_REQUEST");
    expect(r.handoff).toBe(true);
    expect(r.next_action).toBe("handoff");
    expect(r.handoff_reason).toBe("explicit human request");
  });

  it("auto-detects regional scripts and returns a regional fallback reply", async () => {
    const pack = getPack("coaching");
    const r = await runMessageGraph({
      pack,
      messageText: "கட்டணம் எவ்வளவு?",
      preferredLanguage: "auto",
    });
    expect(r.response_language).toBe("ta");
    expect(r.response).toMatch(/[\u0B80-\u0BFF]/);
  });

  it("can force a target regional language for the reply", async () => {
    const pack = getPack("coaching");
    const r = await runMessageGraph({
      pack,
      messageText: "what is the price?",
      preferredLanguage: "te",
    });
    expect(r.response_language).toBe("te");
    expect(r.response).toMatch(/[\u0C00-\u0C7F]/);
  });
});

describe("pack catalogue", () => {
  it("lists all 13 packs (12 verticals + custom) in insertion order", () => {
    const verticals = listVerticals().map((v) => v.vertical);
    expect(verticals).toEqual([
      "custom", "coaching", "clinic", "real_estate", "salon", "ecommerce",
      "b2b", "travel", "political_party", "restaurant", "gym", "automobile",
      "insurance",
    ]);
  });
});
