/**
 * dev-inbound.ts — inject one inbound message straight into the pipeline (dev).
 *
 * The local-dev analogue of `pnpm dev:inbound "<text>"`: drives
 * `processInboundMessage` directly (bypassing the HTTP/signature layer — use
 * `/api/dev/inject` for the full signed path) against a seeded demo workspace,
 * then prints the decision (intent, stage move, handoff, reply).
 *
 * Run:  npx tsx scripts/dev-inbound.ts "<text>" [phoneNumberId] [from] [name]
 *
 * Defaults target the coaching demo workspace seeded by scripts/seed-demo.ts
 * (phoneNumberId 20000000000000).
 */
import { loadEnv } from "./_env";
loadEnv();

import { processInboundMessage } from "@/features/whatsapp/inbound";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";

async function main(): Promise<void> {
  const text = process.argv[2];
  if (!text) {
    console.error('Usage: npx tsx scripts/dev-inbound.ts "<text>" [phoneNumberId] [from] [name]');
    process.exit(1);
  }
  const phoneNumberId = process.argv[3] ?? "20000000000000"; // coaching demo
  const from = process.argv[4] ?? "919999000001";
  const name = process.argv[5] ?? "Dev Customer";

  const repo = new AppwriteWhatsAppRepo();
  const res = await processInboundMessage(repo, {
    provider: "whatsapp_sim",
    providerEventId: `dev:${Date.now()}`,
    phoneNumberId,
    waId: from,
    name,
    text,
  });

  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error("✗ dev-inbound failed:", err);
  process.exit(1);
});
