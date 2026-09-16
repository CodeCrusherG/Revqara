"use client";

/**
 * SegmentTable — the planned A/B segments with their criteria, audience size,
 * send time, and predicted rates. Ported from
 * frontend/src/components/SegmentTable.jsx. Uses the shared DataTable primitive.
 */

import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { SegmentView } from "@/features/campaigns/types";

export interface SegmentTableProps {
  segments: SegmentView[];
}

function criteriaChips(criteria: Record<string, unknown>): string[] {
  return Object.entries(criteria)
    .slice(0, 4)
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ");
      if (Array.isArray(v)) return `${label}: ${v.join("–")}`;
      return `${label}: ${String(v)}`;
    });
}

const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;

export function SegmentTable({ segments }: SegmentTableProps) {
  const columns: DataTableColumn<SegmentView>[] = [
    {
      id: "label",
      header: "Segment",
      cell: (s) => <span className="font-medium">{s.label}</span>,
    },
    {
      id: "criteria",
      header: "Criteria",
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          {criteriaChips(s.criteria).map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] font-normal">
              {c}
            </Badge>
          ))}
          {Object.keys(s.criteria).length === 0 ? (
            <span className="text-xs text-muted-foreground">All contacts</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "audience",
      header: "Audience",
      cell: (s) => (
        <span className="flex items-center gap-1.5 tabular-nums">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {s.customerIds.length.toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      id: "sendTime",
      header: "Send time (IST)",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">{s.sendTime ?? "—"}</span>
      ),
    },
    {
      id: "open",
      header: "Pred. open",
      cell: (s) => (
        <span className="tabular-nums">{pct(s.predictedOpenRate)}</span>
      ),
    },
    {
      id: "click",
      header: "Pred. click",
      cell: (s) => (
        <span className="tabular-nums">{pct(s.predictedClickRate)}</span>
      ),
    },
  ];

  return (
    <DataTable
      data={segments}
      columns={columns}
      rowKey={(s) => s.id}
      pageSize={0}
      empty={
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No segments yet.
        </div>
      }
    />
  );
}
