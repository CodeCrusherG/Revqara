"use client";

/**
 * AIPredictionCard — glass-box engagement prediction for a segment+variant.
 * Ported from frontend/src/components/AIPredictionCard.jsx: shows predicted
 * open/click rate + a confidence chip, with the honesty that this is a
 * heuristic (deterministic) score, not a black-box probability.
 */

import { Sparkles, TrendingUp, MousePointerClick } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { cn } from "@/lib/utils";

export interface AIPredictionCardProps {
  /** 0..1 predicted open rate. */
  openRate: number;
  /** 0..1 predicted click rate. */
  clickRate: number;
  confidence?: "High" | "Medium" | "Low" | null;
  className?: string;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  Medium: "bg-primary/15 text-primary",
  Low: "bg-muted text-muted-foreground",
};

export function AIPredictionCard({
  openRate,
  clickRate,
  confidence,
  className,
}: AIPredictionCardProps) {
  return (
    <Card className={cn("border-primary/20 bg-primary/[0.03]", className)}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI prediction
          </span>
          {confidence ? (
            <Badge
              variant="secondary"
              className={cn(
                "border-0 text-[10px]",
                CONFIDENCE_STYLES[confidence] ?? CONFIDENCE_STYLES.Low,
              )}
            >
              {confidence} confidence
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Metric
            icon={<TrendingUp className="h-4 w-4" />}
            label="Open rate"
            value={openRate}
          />
          <Metric
            icon={<MousePointerClick className="h-4 w-4" />}
            label="Click rate"
            value={clickRate}
          />
        </div>

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Heuristic estimate from cohort signals (channel, recency, send time) —
          a transparent score, not a black-box probability.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">
        <AnimatedNumber
          value={Number.isFinite(value) ? value * 100 : 0}
          decimals={1}
          suffix="%"
          startOnView={false}
        />
      </div>
    </div>
  );
}
