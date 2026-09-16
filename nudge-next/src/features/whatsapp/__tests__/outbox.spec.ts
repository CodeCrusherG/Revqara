/**
 * Outbox tests — a port of `backend/tests/test_outbox.py` (retry/backoff,
 * dead-after-max-attempts, idempotent enqueue) over InMemoryWhatsAppRepo +
 * drainOutbox, with an injected fake sender (parity with the Python `send_fn`).
 * Adds the end-to-end mock-send drain + wamid backfill case (Phase-4 DoD).
 */
import { describe, expect, it } from "vitest";

import { enqueueMessage, drainOutbox, MAX_BACKOFF_SECONDS } from "../outbox";
import { InMemoryWhatsAppRepo } from "../repo-inmemory";
import type { MessageSender } from "../send";

const WS = "ws_outbox";

function enqueue(
  repo: InMemoryWhatsAppRepo,
  key: string,
  inboxMessageId?: string,
) {
  return enqueueMessage(repo, {
    workspaceId: WS,
    to: "91900",
    text: "hello",
    sender: "pnid",
    idempotencyKey: key,
    inboxMessageId,
  });
}

describe("outbox retry then succeeds", () => {
  it("first send fails (backoff), retried after the window, then sent + wamid backfilled", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    const convo = await repo.upsertConversation({
      workspaceId: WS,
      phoneNumberId: "pnid",
      customerWaId: "91900",
      customerName: "X",
    });
    const msg = await repo.addInboxMessage({
      workspaceId: WS,
      conversationId: convo.$id,
      direction: "outbound",
      sender: "bot",
      text: "hello",
    });
    await enqueue(repo, "retry-key", msg.$id);

    let n = 0;
    const flaky: MessageSender = async () => {
      n += 1;
      if (n === 1) throw new Error("provider down");
      return "wamid-123";
    };

    const t0 = new Date("2026-06-17T12:00:00.000Z");
    const s1 = await drainOutbox(repo, { now: t0, sender: flaky });
    expect(s1.failed).toBe(1);
    let row = (await repo.getOutboxByKey(WS, "retry-key"))!;
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(new Date(row.nextAttemptAt!).getTime()).toBeGreaterThan(t0.getTime());

    // Too soon — not retried yet.
    const s2 = await drainOutbox(repo, { now: t0, sender: flaky });
    expect(s2.processed).toBe(0);

    // After backoff — retried and succeeds.
    const t1 = new Date(t0.getTime() + 60_000);
    const s3 = await drainOutbox(repo, { now: t1, sender: flaky });
    expect(s3.sent).toBe(1);
    row = (await repo.getOutboxByKey(WS, "retry-key"))!;
    expect(row.status).toBe("sent");
    expect(row.providerMessageId).toBe("wamid-123");
    // wamid backfilled onto the outbound inbox message.
    const backfilled = repo.allInbox().find((m) => m.$id === msg.$id);
    expect(backfilled?.wamid).toBe("wamid-123");
  });
});

describe("outbox marks dead after max attempts", () => {
  it("a row with maxAttempts=2 that always fails becomes dead", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    const row = await enqueue(repo, "dead-key");
    row.maxAttempts = 2; // mutate live row (parity with the Python override)

    const alwaysFail: MessageSender = async () => {
      throw new Error("nope");
    };

    const t = new Date("2026-06-17T12:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      await drainOutbox(repo, {
        now: new Date(t.getTime() + i * 120_000),
        sender: alwaysFail,
      });
    }
    const after = (await repo.getOutboxByKey(WS, "dead-key"))!;
    expect(after.status).toBe("dead");
    expect(after.attempts).toBe(2);
  });
});

describe("outbox idempotency prevents duplicate sends", () => {
  it("a duplicate enqueue returns the same row and sends exactly once", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    const r1 = await enqueue(repo, "same-key");
    const r2 = await enqueue(repo, "same-key");
    expect(r1.$id).toBe(r2.$id);
    expect(
      repo.allOutbox().filter((o) => o.idempotencyKey === "same-key"),
    ).toHaveLength(1);

    let sends = 0;
    const counting: MessageSender = async () => {
      sends += 1;
      return `wamid-${sends}`;
    };
    await drainOutbox(repo, { now: new Date("2026-06-17T12:00:00.000Z"), sender: counting });
    expect(sends).toBe(1);
  });
});

describe("backoff cap", () => {
  it("nextAttemptAt delta is min(300, 2**attempts) seconds", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    await enqueue(repo, "cap-key");
    const failing: MessageSender = async () => {
      throw new Error("x");
    };
    const t = new Date("2026-06-17T12:00:00.000Z");
    // attempt 1 → backoff 2s
    await drainOutbox(repo, { now: t, sender: failing });
    let row = (await repo.getOutboxByKey(WS, "cap-key"))!;
    expect((new Date(row.nextAttemptAt!).getTime() - t.getTime()) / 1000).toBe(2);

    // Drive attempts up; the backoff must never exceed MAX_BACKOFF_SECONDS.
    for (let i = 2; i <= 10; i++) {
      const due = new Date(new Date(row.nextAttemptAt!).getTime());
      await drainOutbox(repo, { now: due, sender: failing });
      row = (await repo.getOutboxByKey(WS, "cap-key"))!;
      if (row.status === "dead") break;
      const delta = (new Date(row.nextAttemptAt!).getTime() - due.getTime()) / 1000;
      expect(delta).toBeLessThanOrEqual(MAX_BACKOFF_SECONDS);
      expect(delta).toBe(Math.min(MAX_BACKOFF_SECONDS, 2 ** row.attempts));
    }
  });
});

describe("sends/day cap enforced in the worker (§6)", () => {
  it("stops sending once a workspace's remaining budget is exhausted", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    await enqueue(repo, "cap-1");
    await enqueue(repo, "cap-2");
    await enqueue(repo, "cap-3");

    let sends = 0;
    const counting: MessageSender = async () => {
      sends += 1;
      return `wamid-${sends}`;
    };

    // Budget of 2 → only two rows send; the third is skipped (left pending).
    const stats = await drainOutbox(repo, {
      now: new Date("2026-06-17T12:00:00.000Z"),
      sender: counting,
      remainingSends: () => 2,
    });
    expect(stats.sent).toBe(2);
    expect(sends).toBe(2);
    const pending = repo.allOutbox().filter((o) => o.status === "pending");
    expect(pending).toHaveLength(1); // the skipped row stays claimable
  });

  it("a zero budget sends nothing and leaves rows pending", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    await enqueue(repo, "z-1");
    const stats = await drainOutbox(repo, {
      now: new Date(),
      sender: async () => "wamid",
      remainingSends: () => 0,
    });
    expect(stats.sent).toBe(0);
    expect(stats.processed).toBe(0);
    expect(repo.allOutbox()[0].status).toBe("pending");
  });

  it("default (no resolver) is uncapped — existing behavior unchanged", async () => {
    const repo = new InMemoryWhatsAppRepo();
    repo.seedWorkspace({ workspaceId: WS });
    await enqueue(repo, "u-1");
    await enqueue(repo, "u-2");
    const stats = await drainOutbox(repo, {
      now: new Date(),
      sender: async () => "wamid",
    });
    expect(stats.sent).toBe(2);
  });
});

describe("end-to-end mock send drain", () => {
  it("default sender in mock mode drains and backfills a mock-<uuid> wamid", async () => {
    const prev = process.env.WHATSAPP_MOCK_SEND;
    process.env.WHATSAPP_MOCK_SEND = "1";
    try {
      const repo = new InMemoryWhatsAppRepo();
      repo.seedWorkspace({ workspaceId: WS });
      const convo = await repo.upsertConversation({
        workspaceId: WS,
        phoneNumberId: "pnid",
        customerWaId: "91900",
        customerName: "X",
      });
      const msg = await repo.addInboxMessage({
        workspaceId: WS,
        conversationId: convo.$id,
        direction: "outbound",
        sender: "bot",
        text: "hi there",
      });
      await enqueue(repo, "mock-key", msg.$id);

      // No injected sender → uses the default sendText (mock mode).
      const stats = await drainOutbox(repo, { now: new Date() });
      expect(stats.sent).toBe(1);
      const row = (await repo.getOutboxByKey(WS, "mock-key"))!;
      expect(row.status).toBe("sent");
      expect(row.providerMessageId).toMatch(/^mock-/);
      const backfilled = repo.allInbox().find((m) => m.$id === msg.$id);
      expect(backfilled?.wamid).toMatch(/^mock-/);
    } finally {
      if (prev === undefined) delete process.env.WHATSAPP_MOCK_SEND;
      else process.env.WHATSAPP_MOCK_SEND = prev;
    }
  });
});
