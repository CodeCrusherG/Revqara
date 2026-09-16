import React from 'react';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Line,
    Bar,
    ComposedChart
} from 'recharts';
import { BarChart3 } from 'lucide-react';

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
            <p className="mb-1.5 text-xs font-semibold">{label}</p>
            <div className="space-y-1">
                {payload.map((entry) => (
                    <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                        <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto font-semibold tabular-nums">
                            {Number(entry.value).toFixed(entry.dataKey === 'weighted' ? 1 : 0)}
                            {entry.dataKey === 'weighted' ? '' : '%'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function MetricsChart({ data }) {
    // data format expected: [{ name: 'Variant A', openRate: 25, clickRate: 15, weighted: ... }, ...]

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <BarChart3 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">No metric data yet</p>
                    <p className="text-xs text-muted-foreground">
                        Variant performance will appear here once messages start sending.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 16, right: 12, left: -8, bottom: 8 }}>
                    <defs>
                        <linearGradient id="metricsOpen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="metricsClick" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        dy={8}
                    />
                    <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} content={<ChartTooltip />} />
                    <Legend
                        wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
                        iconType="circle"
                        formatter={(value) => (
                            <span className="text-xs text-muted-foreground">{value}</span>
                        )}
                    />
                    <Bar
                        yAxisId="left"
                        dataKey="openRate"
                        name="Read Rate"
                        fill="url(#metricsOpen)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                    />
                    <Bar
                        yAxisId="left"
                        dataKey="clickRate"
                        name="Click Rate"
                        fill="url(#metricsClick)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                    />
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="weighted"
                        name="Weighted Score"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                        activeDot={{ r: 5 }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
