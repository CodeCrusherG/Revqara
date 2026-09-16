/**
 * Pack resolution — a port of `get_pack` / `list_verticals` from
 * `backend/ai_graph/packs.py`.
 */
import type { Pack, VerticalSummary } from "../types";
import { UNIVERSAL_INTENTS, UNIVERSAL_PIPELINE, VERTICAL_PACKS } from "./data";

export { UNIVERSAL_INTENTS, UNIVERSAL_PIPELINE, VERTICAL_PACKS };
export type { Pack, VerticalSummary };

/**
 * Resolve a vertical pack. Missing/empty → custom (silent). Unknown non-empty
 * vertical → custom + a logged warning (config drift / bad data).
 */
export function getPack(vertical: string | null | undefined): Pack {
  if (!vertical) {
    return VERTICAL_PACKS.custom;
  }
  const found = VERTICAL_PACKS[vertical];
  if (found === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[packs] unknown vertical ${JSON.stringify(vertical)} — falling back to 'custom'`);
    return VERTICAL_PACKS.custom;
  }
  return found;
}

/** Lightweight catalogue of every vertical (preserves insertion order). */
export function listVerticals(): VerticalSummary[] {
  return Object.values(VERTICAL_PACKS).map((p) => ({
    vertical: p.vertical,
    label: p.label,
    pipeline_stages: p.pipeline_stages,
    lead_fields: p.lead_fields,
  }));
}
