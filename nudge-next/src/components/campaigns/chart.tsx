"use client";

/**
 * Hand-rolled SVG/div charts (NO recharts — not installed). Bound to CSS
 * variables so light/dark themes work. Ported from the spirit of
 * frontend/src/components/MetricsChart.jsx (open/click bars per variant) but
 * rebuilt as primitives.
 *
 * Two primitives:
 *  - <BarChart>  grouped horizontal bars (e.g. open vs click rate per variant)
 *  - <LineChart> a single-series SVG sparkline/trend (predicted vs actual)
 *
 * Both animate width/opacity only (transform-friendly), respect reduced motion
 * via framer's MotionConfig at the root, and use `tabular-nums` for values.
 */

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface BarSeries {
  label: string;
  /** 0..1 values, one per group. */
  values: number[];
  /** CSS color (e.g. "hsl(var(--primary))"). */
  color: string;
}

export interface BarChartProps {
  /** Group (row) labels — one per index in each series.values. */
  groups: string[];
  series: BarSeries[];
  /** Format a 0..1 value for display. Defaults to percentage. */
  format?: (v: number) => string;
  className?: string;
}

/**
 * Grouped horizontal bar chart. Each group renders one bar per series, scaled to
 * the max value across all series (so small rates stay readable).
 */
export function BarChart({
  groups,
  series,
  format = (v) => `${Math.round(v * 100)}%`,
  className,
}: BarChartProps) {
  const max = Math.max(
    0.0001,
    ...series.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0))),
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {groups.map((group, gi) => (
          <div key={`${group}-${gi}`} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate pr-2 font-medium">{group}</span>
            </div>
            <div className="space-y-1">
              {series.map((s) => {
                const v = Number.isFinite(s.values[gi]) ? s.values[gi] : 0;
                const pct = Math.max(0, Math.min(1, v / max));
                return (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct * 100}%` }}
                        transition={{ duration: 0.6, ease: EASE }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {format(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface LinePoint {
  label: string;
  value: number;
}

export interface LineChartProps {
  points: LinePoint[];
  /** Y-axis ceiling (0..1 domain by default). */
  max?: number;
  color?: string;
  format?: (v: number) => string;
  className?: string;
}

/**
 * Minimal single-series SVG line/area chart for a small trend (e.g. predicted vs
 * realised over iterations). Uses a viewBox so it scales fluidly.
 */
export function LineChart({
  points,
  max,
  color = "hsl(var(--primary))",
  format = (v) => `${Math.round(v * 100)}%`,
  className,
}: LineChartProps) {
  const W = 100;
  const H = 40;
  const ceiling = Math.max(
    0.0001,
    max ?? Math.max(...points.map((p) => p.value), 0.0001),
  );
  const n = points.length;

  if (n === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        No data yet.
      </div>
    );
  }

  const coords = points.map((p, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    const y = H - Math.max(0, Math.min(1, p.value / ceiling)) * H;
    return { x, y };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area = `${line} L${coords[n - 1].x},${H} L${coords[0].x},${H} Z`;

  return (
    <div className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label="Trend chart"
      >
        <motion.path
          d={area}
          fill={color}
          fillOpacity={0.12}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={1.6}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {points.map((p, i) => (
          <span key={i} className="tabular-nums">
            {format(p.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
