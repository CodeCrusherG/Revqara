/**
 * Inbound pipeline tests — ports of:
 *   backend/tests/test_inbound_idempotency.py
 *   backend/tests/test_optout.py
 *   backend/tests/test_handoff.py
 *   backend/tests/test_human_takeover.py
 * plus the no-workspace + media-only-clarify cases from §5/Phase-4 DoD.
 *
 * Run over InMemoryWhatsAppRepo (the rolled-back-DB analogue). The deterministic
 * graph path runs (no LLM env).
 */
import { describe, expect, it } from "vitest";

import { makeWorkspace } from "./helpers";
import { processInboundMessage } from "../inbound";
import { InMemoryWhatsAppRepo } from "../repo-inmemory";

describe("duplicate inbound webhook is ignored (no duplicate state)", () => {
  it("creates exactly one of everything; second delivery is a no-op", async () => {
    const h = makeWorkspace("coaching");
    const eid = "dup-event-1";

    const first = await h.sendInbound("fees kitna hai for weekend batch?", {
      eventId: eid,
    });
    expect(first.status).toBe("processed");
    const convoId = first.conversation_id!;

    const second = await h.sendInbound("fees kitna hai for weekend batch?", {
      eventId: eid,
    });
    expect(second.status).toBe("ignored_duplicate");

    expect(h.repo.inboxFor(convoId, "inbound")).toHaveLength(1);
    expect(h.repo.allEvents().filter((e) => e.providerEventId === eid)).toHaveLength(1);
    expect(
      h.repo.allOutbox().filter((o) => o.conversationId === convoId),
    ).toHaveLength(1);
    expect(h.repo.tracesFor(convoId)).toHaveLength(1);
    // One lead per conversation.
    const lead = h.repo.getLead(first.lead_id!);
    expect(lead).toBeDefined();
  });
});

describe("no workspace for phone_number_id", () => {
  it("marks the event failed and returns no_workspace (never throws)", async () => {
    const repo = new InMemoryWhatsAppRepo();
    // No account seeded — routing finds no workspace.
    const result = await processInboundMessage(repo, {
      provider: "whatsapp_sim",
      providerEventId: "evt-orphan",
      phoneNumberId: "unknown-pnid",
      waId: "919000000099",
      name: "Nobody",
      text: "hello?",
    });
    expect(result.status).toBe("no_workspace");
    const ev = await repo.getWebhookEvent("whatsapp_sim", "evt-orphan");
    expect(ev?.status).toBe("failed");
    expect(ev?.error).toContain("no workspace");
  });
});

describe("opt-out marks the contact and stops the AI", () => {
  it("STOP sets opted_out, enqueues the opt-out reply, returns opted_out", async () => {
    const h = makeWorkspace("ecommerce");

    await h.sendInbound("Price of the wireless earbuds?", { waId: "919111000001" });
    const before = h.repo.contactByNumber(h.workspaceId, "919111000001");
    expect(before?.optInStatus).toBe("opted_in");

    const result = await h.sendInbound("STOP", { waId: "919111000001" });
    expect(result.status).toBe("opted_out");

    const contact = h.repo.contactByNumber(h.workspaceId, "919111000001");
    expect(contact?.optInStatus).toBe("opted_out");

    // The opt-out reply was enqueued exactly once under the optout:<id> key.
    const optoutRows = h.repo
      .allOutbox()
      .filter((o) => o.idempotencyKey.startsWith("optout:"));
    expect(optoutRows).toHaveLength(1);
  });
});

describe("media-only / empty message → clarify (gated on auto_reply + bot)", () => {
  it("enqueues one clarify reply when AI-owned", async () => {
    const h = makeWorkspace("salon");
    const result = await h.sendInbound(null);
    expect(result.status).toBe("unsupported_message");
    const clarifies = h.repo
      .allOutbox()
      .filter((o) => o.idempotencyKey.startsWith("clarify:"));
    expect(clarifies).toHaveLength(1);
  });

  it("does NOT enqueue when the bot is disabled", async () => {
    const h = makeWorkspace("salon", { botEnabled: false });
    const result = await h.sendInbound("   ");
    expect(result.status).toBe("unsupported_message");
    expect(h.repo.allOutbox()).toHaveLength(0);
  });
});

describe("complaints / emergencies hand off to a human", () => {
  it("clinic emergency sets handoff, autoReply=false, trace.handoffRequired", async () => {
    const h = makeWorkspace("clinic");
    const result = await h.sendInbound(
      "My father has severe chest pain, this is an emergency",
    );
    expect(result.handoff).toBe(true);

    const convo = h.repo.getConversation(result.conversation_id!);
    expect(convo?.autoReply).toBe(false);

    const trace = h.repo.tracesFor(result.conversation_id!)[0];
    expect(trace.handoffRequired).toBe(true);
    expect(trace.handoffReason).toBeTruthy();

    // needs_human flagged on the lead, still assignable.
    const lead = h.repo.getLead(result.lead_id!);
    expect(lead?.needsHuman).toBe(true);
  });

  it("refund/complaint triggers handoff + autoReply=false; reply sender=agent", async () => {
    const h = makeWorkspace("coaching");
    const result = await h.sendInbound("worst service, refund chahiye right now");
    expect(result.handoff).toBe(true);
    expect(h.repo.getConversation(result.conversation_id!)?.autoReply).toBe(false);
    const outbound = h.repo.inboxFor(result.conversation_id!, "outbound");
    expect(outbound.at(-1)?.sender).toBe("agent");
  });
});

describe("AI does not override a human takeover", () => {
  it("no new reply or stage move while a human owns the thread", async () => {
    const h = makeWorkspace("coaching");

    const first = await h.sendInbound("hi", { waId: "919222000001", eventId: "evt-a" });
    const convoId = first.conversation_id!;
    const stageAfterFirst = first.stage_after;

    // A human takes over.
    await h.repo.updateConversation(convoId, { autoReply: false });

    const outboxBefore = h.repo.outboxFor(convoId).length;
    const outboundBefore = h.repo.inboxFor(convoId, "outbound").length;

    const second = await h.sendInbound("fees kitna hai for weekend batch?", {
      waId: "919222000001",
      eventId: "evt-b",
    });
    expect(second.ai_owned).toBe(false);
    expect(second.response).toBeNull();

    // No new outbound reply (enqueued or stored).
    expect(h.repo.outboxFor(convoId).length).toBe(outboxBefore);
    expect(h.repo.inboxFor(convoId, "outbound").length).toBe(outboundBefore);
    // The AI did NOT advance the pipeline stage.
    expect(h.repo.getLead(second.lead_id!)?.status).toBe(stageAfterFirst);
    // But a human_takeover trace is still written (always-trace invariant).
    const traces = h.repo.tracesFor(convoId);
    expect(traces.at(-1)?.nextAction).toBe("human_takeover");
  });
});

describe("lead stage transitions through the real graph", () => {
  it("price query advances the coaching pipeline to fee_discussed", async () => {
    const h = makeWorkspace("coaching");
    const result = await h.sendInbound("fees kitna hai for weekend batch?");
    // result.intent is the uppercase classifier intent (matches inbound.py's
    // `"intent": intent`); the lead.intent field is lowercased.
    expect(result.intent).toBe("PRICE_QUERY");
    expect(result.stage_before).toBe("new");
    expect(result.stage_after).toBe("fee_discussed");
    const lead = h.repo.getLead(result.lead_id!);
    expect(lead?.status).toBe("fee_discussed");
    expect(lead?.intent).toBe("price_query");
  });
});

describe("idempotent enqueue under replay", () => {
  it("re-processing the same event produces no second outbox row", async () => {
    const h = makeWorkspace("coaching");
    const eid = "replay-1";
    const first = await h.sendInbound("what is the price?", { eventId: eid });
    const convoId = first.conversation_id!;
    const replyRows = h.repo
      .allOutbox()
      .filter((o) => o.idempotencyKey === `reply:${eid}`);
    expect(replyRows).toHaveLength(1);

    // Replay the identical delivery — dedup short-circuits; no new enqueue.
    const again = await h.sendInbound("what is the price?", { eventId: eid });
    expect(again.status).toBe("ignored_duplicate");
    expect(
      h.repo.allOutbox().filter((o) => o.idempotencyKey === `reply:${eid}`),
    ).toHaveLength(1);
    expect(h.repo.outboxFor(convoId)).toHaveLength(1);
  });
});

describe("campaign reply attribution", () => {
  it("flips the latest whatsapp_messages.replied for the waId", async () => {
    const h = makeWorkspace("ecommerce");
    const seeded = h.repo.seedWhatsAppMessage("919333000001", h.workspaceId);
    await h.sendInbound("what is the price of the earbuds?", { waId: "919333000001" });
    // The in-memory row should now be replied=true.
    const latest = await h.repo.getLatestWhatsAppMessageByWaId("919333000001");
    expect(latest?.$id).toBe(seeded.$id);
    expect(latest?.replied).toBe(true);
  });
});
