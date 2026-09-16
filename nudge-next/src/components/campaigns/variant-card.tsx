"use client";

/**
 * VariantCard — one generated message variant (subject + body + content flags)
 * with its segment's AI prediction. Ported from
 * frontend/src/components/VariantCard.jsx. Renders the simple bold markdown the
 * deterministic copy emits (**word** → <strong>) and surfaces the allowed URL.
 */

import * as React from "react";
import { Smile, Link2, Send } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPredictionCard } from "./ai-prediction-card";
import { cn } from "@/lib/utils";

export interface VariantCardView {
  variantType?: string | null;
  subject: string | null;
  body: string;
  hasEmoji: boolean;
  hasUrl: boolean;
}

export interface VariantCardProps {
  segmentLabel: string;
  variant: VariantCardView;
  prediction?: {
    openRate: number;
    clickRate: number;
    confidence?: "High" | "Medium" | "Low" | null;
  } | null;
  className?: string;
}

/** Render `**bold**` markdown segments to <strong> (deterministic copy style). */
function renderBody(body: string): React.ReactNode {
  const parts = body.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return <strong key={i}>{m[1]}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function VariantCard({
  segmentLabel,
  variant,
  prediction,
  className,
}: VariantCardProps) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          {variant.variantType ? (
            <Badge variant="secondary" className="mb-1.5">
              Variant {variant.variantType}
            </Badge>
          ) : null}
          <p className="truncate text-sm font-medium text-muted-foreground">
            {segmentLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {variant.hasEmoji ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground"
              title="Contains emoji"
            >
              <Smile className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {variant.hasUrl ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground"
              title="Contains a link"
            >
              <Link2 className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {variant.subject ? (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Subject
            </p>
            <p className="mt-0.5 text-sm font-semibold">{variant.subject}</p>
          </div>
        ) : null}

        {/* WhatsApp-style bubble preview. */}
        <div className="rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-3 text-sm leading-relaxed">
          <span className="mb-1.5 flex items-center gap-1 text-[11px] text-primary">
            <Send className="h-3 w-3" /> Message preview
          </span>
          <p className="whitespace-pre-wrap break-words">
            {renderBody(variant.body)}
          </p>
        </div>

        {prediction ? (
          <AIPredictionCard
            openRate={prediction.openRate}
            clickRate={prediction.clickRate}
            confidence={prediction.confidence ?? null}
            className="mt-auto"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
