/**
 * outbox-drain.ts — one worker pass over the message_outbox (dev helper).
 *
 * The local-dev analogue of the always-on Python `_outbox_loop`: claims due rows
 * and sends them (mock mode if WHATSAPP_MOCK_SEND=1), applying backoff/dead per
 * the verbatim policy, and backfilling wamids onto inbox_messages. Prints the
 * drain stats.
 *
 * Run:  npx tsx scripts/outbox-drain.ts [limit]
 */
import { loadEnv } from "./_env";
loadEnv();

import { drainOutbox } from "@/features/whatsapp/outbox";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? "25") || 25;
  const repo = new AppwriteWhatsAppRepo();
  const stats = await drainOutbox(repo, { limit });
  console.log(
    `outbox drain: processed=${stats.processed} sent=${stats.sent} ` +
      `failed=${stats.failed} dead=${stats.dead}`,
  );
}

main().catch((err) => {
  console.error("✗ outbox drain failed:", err);
  process.exit(1);
});
