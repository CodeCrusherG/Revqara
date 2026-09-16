/**
 * Transactional outbound outbox — a port of `backend/tools/outbox.py`
 * (`enqueue_message` + `process_outbox`) over the `WhatsAppRepo` port.
 *
 * The AI graph / opt-out / clarify flows never call Meta as a side effect; they
 * enqueue a durable row and this worker drains it with retry + backoff, marking
 * rows `dead` after `maxAttempts`. The `$id = sha256(workspaceId:idempotencyKey)`
 * collision (uq_outbox_idem) guarantees the same logical reply is enqueued at
 * most once, so duplicate webhooks / retries can never double-send.
 *
 * Backoff is VERBATIM: on failure `attempts++`; `dead` at `maxAttempts`, else
 * `failed` with `nextAttemptAt = now + min(300, 2**attempts)s`.
 *
 * SENDS/DAY CAP (Phase 7, §6 'critical'): the per-day send limit is enforced HERE
 * in the async worker — not just at campaign-create — via an optional
 * `remainingSends(workspaceId)` resolver. Before sending a row, the worker asks
 * the resolver how many sends that workspace has left today; when a workspace's
 * budget is exhausted, its remaining due rows are skipped (left `pending`/`failed`
 * for the next drain after midnight). The resolver DEFAULTS to Infinity, so every
 * existing test (which passes none) is unaffected.
 */
import type { MessageSender } from "./send";
import { sendText } from "./send";
import type { EnqueueOutboxInput, OutboxRow, WhatsAppRepo } from "./repo";

export const MAX_BACKOFF_SECONDS = 300;

/**
 * Enqueue an outbound message. Idempotent on (workspaceId, idempotencyKey):
 * a second call with the same key returns the existing row (never a duplicate).
 */
export async function enqueueMessage(
  repo: WhatsAppRepo,
  input: EnqueueOutboxInput,
): Promise<OutboxRow> {
  const created = await repo.enqueueOutboxOrNull(input);
  if (created) return created;
  // Lost the race / already enqueued — return the existing row.
  const existing = await repo.getOutboxByKey(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (!existing) {
    // Should be unreachable (create said duplicate but row is gone); surface it.
    throw new Error(
      `enqueueMessage: outbox row vanished for ${input.workspaceId}:${input.idempotencyKey}`,
    );
  }
  return existing;
}

export interface DrainStats {
  processed: number;
  sent: number;
  failed: number;
  dead: number;
}

export interface DrainOptions {
  limit?: number;
  now?: Date;
  /** Injectable sender (parity with the Python `send_fn`). Defaults to sendText. */
  sender?: MessageSender;
  /**
   * Per-workspace remaining sends today (the plan §6 cap). Returns how many more
   * messages `workspaceId` may send today; rows are skipped once its budget hits
   * 0. DEFAULTS to Infinity (no cap) so existing callers/tests are unaffected.
   * Resolved at most once per workspace per drain.
   */
  remainingSends?: (workspaceId: string) => Promise<number> | number;
}

/**
 * Drain due rows once. Claims `status∈{pending,failed}`, `attempts<maxAttempts`,
 * due (`nextAttemptAt` null or <= now), oldest-first up to `limit`. For each:
 * optimistic `pending/failed → sending` + `attempts++` (Appwrite has no SELECT
 * FOR UPDATE), send, then:
 *   - success ⇒ `sent` + providerMessageId + sentAt; backfill inbox wamid.
 *   - failure ⇒ `dead` at maxAttempts, else `failed` with backoff nextAttemptAt.
 */
export async function drainOutbox(
  repo: WhatsAppRepo,
  options: DrainOptions = {},
): Promise<DrainStats> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  const send = options.sender ?? sendText;
  const remainingSendsFor =
    options.remainingSends ?? (() => Number.POSITIVE_INFINITY);

  const rows = await repo.listDueOutbox(now, limit);
  const stats: DrainStats = { processed: 0, sent: 0, failed: 0, dead: 0 };

  // Per-workspace remaining-send budget for this drain (resolved once each).
  const budget = new Map<string, number>();
  async function budgetFor(workspaceId: string): Promise<number> {
    const cached = budget.get(workspaceId);
    if (cached !== undefined) return cached;
    const remaining = await remainingSendsFor(workspaceId);
    budget.set(workspaceId, remaining);
    return remaining;
  }

  for (const row of rows) {
    // Sends/day cap: skip this row if its workspace has no budget left today.
    // The row stays claimable for the next drain (after UTC midnight resets).
    if ((await budgetFor(row.workspaceId)) <= 0) {
      continue;
    }

    stats.processed += 1;
    const attempts = row.attempts + 1;
    // Optimistic claim: flip to sending + bump attempts before the send.
    await repo.updateOutbox(row.$id, { status: "sending", attempts });

    let payload: { to?: string; text?: string; sender?: string | null };
    try {
      payload = JSON.parse(row.payloadJson ?? "{}");
    } catch {
      payload = {};
    }

    try {
      const pmid = await send(
        payload.to ?? "",
        payload.text ?? "",
        payload.sender ?? null,
      );
      await repo.updateOutbox(row.$id, {
        status: "sent",
        providerMessageId: pmid,
        sentAt: new Date().toISOString(),
        lastError: null,
      });
      // Backfill the outbound inbox message's wamid (only if not already set).
      if (row.inboxMessageId && pmid) {
        await repo.setInboxMessageWamid(row.inboxMessageId, pmid);
      }
      // Consume one unit of the workspace's daily send budget.
      budget.set(row.workspaceId, (budget.get(row.workspaceId) ?? 0) - 1);
      stats.sent += 1;
    } catch (err) {
      const lastError = (err instanceof Error ? err.message : String(err)).slice(
        0,
        1000,
      );
      if (attempts >= row.maxAttempts) {
        await repo.updateOutbox(row.$id, { status: "dead", lastError });
        stats.dead += 1;
      } else {
        const backoff = Math.min(MAX_BACKOFF_SECONDS, 2 ** attempts);
        const nextAttemptAt = new Date(now.getTime() + backoff * 1000).toISOString();
        await repo.updateOutbox(row.$id, {
          status: "failed",
          nextAttemptAt,
          lastError,
        });
        stats.failed += 1;
      }
    }
  }

  return stats;
}
