import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SegmentTable({ segments }) {
    const [expandedRow, setExpandedRow] = useState(null);

    if (!segments || segments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
                <Users className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No segments defined.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10" />
                        <TableHead>Segment Label</TableHead>
                        <TableHead>Customers</TableHead>
                        <TableHead>Send Time (IST)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {segments.map((seg, idx) => {
                        const isExpanded = expandedRow === idx;
                        const count = seg.customer_ids?.length || 0;
                        return (
                            <React.Fragment key={seg.id || idx}>
                                <TableRow
                                    className="cursor-pointer"
                                    onClick={() =>
                                        setExpandedRow(isExpanded ? null : idx)
                                    }
                                >
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-muted-foreground"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedRow(
                                                    isExpanded ? null : idx
                                                );
                                            }}
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="size-4" />
                                            ) : (
                                                <ChevronRight className="size-4" />
                                            )}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">
                                        {seg.label}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="tabular-nums">
                                            <Users className="mr-1 size-3" />
                                            {count}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground tabular-nums">
                                        {seg.send_time || 'Immediate'}
                                    </TableCell>
                                </TableRow>
                                <AnimatePresence initial={false}>
                                    {isExpanded && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={4} className="p-0">
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden bg-muted/40"
                                                >
                                                    <div className="px-6 py-4">
                                                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                                            Customer IDs
                                                        </p>
                                                        <div className="custom-scrollbar max-h-32 overflow-y-auto break-words rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                                                            {seg.customer_ids
                                                                ? seg.customer_ids.join(', ')
                                                                : 'None'}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </AnimatePresence>
                            </React.Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
