/**
 * Idempotent billing-webhook claim/release over a fake store (R7). Mirrors the
 * Appwrite `$id = eventId` collision: the first claim wins, retries dedupe;
 * releaseEvent removes the row so a subsequent retry re-runs.
 */
import { describe, expect, it } from "vitest";

import {
  claimEvent,
  releaseEvent,
  type BillingEventStore,
  type NewBillingEvent,
} from "@/lib/billing/webhook-events";

/** In-memory fake of the natural-key store ($id = eventId). */
class FakeBillingEventStore implements BillingEventStore {
  readonly rows = new Map<string, NewBillingEvent>();
  inserts = 0;

  async insertOrNull(ev: NewBillingEvent): Promise<boolean> {
    this.inserts += 1;
    if (this.rows.has(ev.eventId)) return false; // $id-409 = duplicate
    this.rows.set(ev.eventId, ev);
    return true;
  }
  async remove(eventId: string): Promise<void> {
    this.rows.delete(eventId);
  }
}

const ev = (eventId: string): NewBillingEvent => ({
  eventId,
  type: "subscription.charged",
  payloadHash: "hash",
});

describe("claimEvent idempotency", () => {
  it("first claim wins, the second (retry) dedupes", async () => {
    const store = new FakeBillingEventStore();
    const first = await claimEvent(store, ev("evt_1"));
    const second = await claimEvent(store, ev("evt_1"));
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(store.rows.size).toBe(1);
  });

  it("distinct event ids each claim independently", async () => {
    const store = new FakeBillingEventStore();
    expect((await claimEvent(store, ev("a"))).claimed).toBe(true);
    expect((await claimEvent(store, ev("b"))).claimed).toBe(true);
    expect(store.rows.size).toBe(2);
  });

  it("releaseEvent lets a retry re-run after a processing failure", async () => {
    const store = new FakeBillingEventStore();
    expect((await claimEvent(store, ev("evt_x"))).claimed).toBe(true);
    // Simulate processing failure → release.
    await releaseEvent(store, "evt_x");
    expect(store.rows.size).toBe(0);
    // The retry now wins the claim again.
    expect((await claimEvent(store, ev("evt_x"))).claimed).toBe(true);
  });

  it("releaseEvent on a missing id is a no-op", async () => {
    const store = new FakeBillingEventStore();
    await expect(releaseEvent(store, "nope")).resolves.toBeUndefined();
  });
});
