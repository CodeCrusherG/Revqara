/**
 * Test helpers — the vitest analogue of `backend/tests/conftest.py`.
 *
 * `makeWorkspace(vertical)` seeds an InMemory repo with a workspace + connected
 * WhatsApp number + enabled bot (parity with the `make_workspace` fixture).
 * `sendInbound(...)` drives one message through `processInboundMessage` (parity
 * with the `send_inbound` fixture). The LLM is never reachable here (no env), so
 * the deterministic graph path runs — fast and fully reproducible.
 */
import { InMemoryWhatsAppRepo } from "../repo-inmemory";
import { processInboundMessage } from "../inbound";
import type { InboundResult } from "../inbound";

let counter = 0;
function uid(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export interface Harness {
  repo: InMemoryWhatsAppRepo;
  workspaceId: string;
  phoneNumberId: string;
  sendInbound: (
    text: string | null,
    opts?: { waId?: string; name?: string; eventId?: string },
  ) => Promise<InboundResult>;
}

export function makeWorkspace(
  vertical = "custom",
  opts: { botEnabled?: boolean } = {},
): Harness {
  const repo = new InMemoryWhatsAppRepo();
  const workspaceId = `ws_${uid()}`;
  const phoneNumberId = `pnid_${uid()}`;

  repo.seedWorkspace({ workspaceId, vertical });
  repo.seedAccount({ phoneNumberId, workspaceId });
  repo.seedBot({ workspaceId, enabled: opts.botEnabled ?? true });

  const sendInbound = (
    text: string | null,
    o: { waId?: string; name?: string; eventId?: string } = {},
  ): Promise<InboundResult> =>
    processInboundMessage(repo, {
      provider: "whatsapp_sim",
      providerEventId: o.eventId ?? `evt-${uid()}`,
      phoneNumberId,
      waId: o.waId ?? "919000000001",
      name: o.name ?? "Test Customer",
      text,
    });

  return { repo, workspaceId, phoneNumberId, sendInbound };
}
