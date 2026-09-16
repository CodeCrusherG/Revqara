import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, PenTool, CheckCircle2, Zap, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const AGENTS = [
    { id: 'profiling', icon: Search, label: 'Audience Insight' },
    { id: 'planning', icon: Brain, label: 'Strategic Architect' },
    { id: 'generating', icon: PenTool, label: 'Creative Studio' },
];

const STAGE_ORDER = ['profiling', 'planning', 'generating', 'pending_approval'];

export default function AgentOrbitals({ activeStage }) {
    return (
        <div className="relative flex h-64 w-full items-center justify-center overflow-hidden">
            {/* Background Rings */}
            <div className="absolute h-48 w-48 rounded-full border border-border opacity-60" />
            <div className="absolute h-32 w-32 rounded-full border border-border opacity-40" />
            <motion.div
                className="absolute h-48 w-48 rounded-full border-t-2 border-primary/40"
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />

            {/* Central Campaign Node */}
            <motion.div
                className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-xl"
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-emerald-500/10" />
                <Zap className="relative h-8 w-8 text-primary" />
            </motion.div>

            {/* Agents Orbiting */}
            {AGENTS.map((agent, idx) => {
                const isActive = activeStage === agent.id;
                const isPast = STAGE_ORDER.indexOf(activeStage) > idx;
                const angle = idx * 120 * (Math.PI / 180);
                const radius = 100;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                    <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: isActive ? 1.15 : 1, x, y }}
                        transition={{ type: 'spring', damping: 14 }}
                        className="absolute z-20"
                    >
                        <div
                            className={cn(
                                'relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2 transition-colors duration-500',
                                isActive &&
                                    'border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/30',
                                isPast &&
                                    !isActive &&
                                    'border-transparent bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
                                !isActive &&
                                    !isPast &&
                                    'border-border bg-card text-muted-foreground shadow-sm'
                            )}
                        >
                            <agent.icon className={cn('h-5 w-5', isActive && 'animate-pulse')} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                                {agent.label}
                            </span>

                            <AnimatePresence>
                                {isPast && !isActive && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-0.5 shadow-sm"
                                    >
                                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
