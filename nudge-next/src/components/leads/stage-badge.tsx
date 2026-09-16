/**
 * StageBadge + stage tone helpers. Pure (no client hooks) — usable in RSC and
 * client islands alike. Ports the `tone()` / `StageBadge` from the React
 * LeadsPage so the emerald/teal/amber stage palette matches 1:1.
 */
import { cn } from "@/lib/utils";

export const humanizeStage = (s: string | null | undefined): string =>
  (s ?? "").replace(/_/g, " ");

export interface StageTone {
  chip: string;
  dot: string;
  bar: string;
}

const WON_KEYS = [
  "won",
  "converted",
  "enrolled",
  "closed",
  "booked",
  "ordered",
  "visited",
  "po_received",
  "scheduled",
];

/** Map a stage name to its colour tone (verbatim from LeadsPage `tone`). */
export function stageTone(stage: string | null | undefined): StageTone {
  const s = (stage ?? "").toLowerCase();
  if (s === "lost") {
    return {
      chip: "bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
      bar: "bg-muted-foreground",
    };
  }
  if (WON_KEYS.some((k) => s.includes(k))) {
    return {
      chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
      bar: "bg-emerald-500",
    };
  }
  if (s === "new" || s === "browsing") {
    return {
      chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
      dot: "bg-teal-500",
      bar: "bg-teal-500",
    };
  }
  return {
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  };
}

export function StageBadge({ stage }: { stage: string | null | undefined }) {
  const t = stageTone(stage);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        t.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {humanizeStage(stage)}
    </span>
  );
}
