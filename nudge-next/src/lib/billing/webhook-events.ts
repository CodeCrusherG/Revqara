/**
 * Idempotent billing-webhook event store (NEXTJS_REWRITE_PLAN.md §6; R7).
 *
 * Razorpay retries webhooks, so each event is claimed exactly once via the
 * natural-key `$id = eventId` collision (atomic, race-free): `claimEvent` inserts
 * a `billing_webhook_events` row and returns `{ claimed: false }` (deduped) if it
 * already exists. On a processing FAILURE the route calls `releaseEvent` to
 * delete the row so a retry re-runs the lifecycle mutation.
 *
 * The logic is written against a tiny `BillingEventStore` PORT so it unit-tests
 * against an in-memory fake exactly as the real Appwrite store runs in prod
 * (mirrors the WhatsAppRepo pattern). `appwriteBillingEventStore()` is the real
 * implementation; it's `server-only`-imported lazily so this module stays pure
 * and importable from tests.
 */

export interface ClaimResult {
  /** True if this caller won the claim (first delivery); false ⇒ duplicate. */
  claimed: boolean;
}

export interface NewBillingEvent {
  eventId: string;
  type: string;
  payloadHash: string;
}

/**
 * Minimal data port for billing-webhook idempotency. `insertOrNull` returns
 * `false` on a `$id`-409 (already present = duplicate); `remove` deletes the row.
 */
export interface BillingEventStore {
  /** Insert the event; returns false if it already exists (duplicate). */
  insertOrNull(ev: NewBillingEvent): Promise<boolean>;
  /** Delete the event row (release on failure so a retry re-runs). */
  remove(eventId: string): Promise<void>;
}

/**
 * Idempotently claim an event. First delivery ⇒ `{ claimed: true }`; any retry of
 * the same `eventId` ⇒ `{ claimed: false }` (the caller should ack + skip).
 */
export async function claimEvent(
  store: BillingEventStore,
  ev: NewBillingEvent,
): Promise<ClaimResult> {
  const inserted = await store.insertOrNull(ev);
  return { claimed: inserted };
}

/**
 * Release a previously-claimed event so a Razorpay retry re-processes it. Called
 * ONLY when processing threw after the claim — never on success.
 */
export async function releaseEvent(
  store: BillingEventStore,
  eventId: string,
): Promise<void> {
  await store.remove(eventId);
}

/**
 * Real Appwrite-backed store. Lazily imports the admin SDK so this module is
 * pure/testable; the import only resolves on the server at call time.
 */
export async function appwriteBillingEventStore(): Promise<BillingEventStore> {
  const { adminDatabases } = await import("@/lib/appwrite/admin");
  const { DATABASE_ID, COLLECTION } = await import("@/lib/appwrite/collections");
  const { AppwriteException } = await import("node-appwrite");

  return {
    async insertOrNull(ev: NewBillingEvent): Promise<boolean> {
      try {
        await adminDatabases().createDocument(
          DATABASE_ID,
          COLLECTION.billingWebhookEvents,
          ev.eventId, // natural key $id = eventId
          {
            type: ev.type,
            processedAt: new Date().toISOString(),
            payloadHash: ev.payloadHash,
          },
        );
        return true;
      } catch (err) {
        if (err instanceof AppwriteException && err.code === 409) return false;
        throw err;
      }
    },
    async remove(eventId: string): Promise<void> {
      try {
        await adminDatabases().deleteDocument(
          DATABASE_ID,
          COLLECTION.billingWebhookEvents,
          eventId,
        );
      } catch (err) {
        if (err instanceof AppwriteException && err.code === 404) return;
        throw err;
      }
    },
  };
}
