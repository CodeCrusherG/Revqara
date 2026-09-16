import React from 'react';
import { Target, AlertCircle, Eye, MousePointerClick, Gauge } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function AIPredictionCard({ segment }) {
    const openRate = ((segment.predicted_open_rate || 0) * 100).toFixed(1);
    const clickRate = ((segment.predicted_click_rate || 0) * 100).toFixed(1);
    const weighted = (parseFloat(clickRate) * 0.7 + parseFloat(openRate) * 0.3).toFixed(1);

    const openRateVal = segment.predicted_open_rate || 0;
    const confidence =
        openRateVal > 0.2 ? 'High' : openRateVal > 0.12 ? 'Medium' : 'Low';

    const confidenceVariant =
        confidence === 'High'
            ? 'success'
            : confidence === 'Medium'
              ? 'warning'
              : 'destructive';

    const metrics = [
        {
            label: 'Read Rate',
            value: openRate,
            icon: Eye,
            indicator: 'bg-teal-500',
            highlight: false,
        },
        {
            label: 'Click Rate',
            value: clickRate,
            icon: MousePointerClick,
            indicator: 'bg-emerald-500',
            highlight: false,
        },
        {
            label: 'Weighted',
            value: weighted,
            icon: Gauge,
            indicator: 'bg-primary',
            highlight: true,
        },
    ];

    return (
        <Card className="p-5">
            <div className="mb-5 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Target className="size-4" />
                    </span>
                    Heuristic Prediction
                </h4>
                <Badge variant={confidenceVariant}>{confidence} Confidence</Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {metrics.map((m) => (
                    <div
                        key={m.label}
                        className={
                            m.highlight
                                ? 'rounded-xl border border-primary/20 bg-primary/5 p-3'
                                : 'rounded-xl border border-border bg-muted/40 p-3'
                        }
                    >
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <m.icon className="size-3" />
                            {m.label}
                        </div>
                        <div
                            className={
                                m.highlight
                                    ? 'text-xl font-bold tabular-nums text-primary'
                                    : 'text-xl font-bold tabular-nums text-foreground'
                            }
                        >
                            {m.value}%
                        </div>
                        <Progress
                            value={Math.min(parseFloat(m.value), 100)}
                            className="mt-2 h-1.5"
                            indicatorClassName={m.indicator}
                        />
                    </div>
                ))}
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <AlertCircle className="size-3" />
                Scores are heuristic estimates and not actual engagement metrics.
            </p>
        </Card>
    );
}
