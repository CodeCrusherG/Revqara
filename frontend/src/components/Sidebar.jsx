import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { billingApi, campaignApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    Send,
    CheckSquare,
    Settings,
    Sparkles,
    Users,
    ListChecks,
    CreditCard,
    MessageSquare,
    FileText,
    Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const SidebarItem = ({ to, icon: Icon, label, disabled }) => (
    <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
            cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive && !disabled
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                disabled && 'pointer-events-none opacity-40'
            )
        }
    >
        {({ isActive }) => (
            <>
                {isActive && !disabled && (
                    <motion.span
                        layoutId="sidebar-active"
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                    />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
            </>
        )}
    </NavLink>
);

const NavGroup = ({ label, children }) => (
    <div className="space-y-1">
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {label}
        </p>
        {children}
    </div>
);

export default function Sidebar() {
    const { id } = useParams();
    const { workspace } = useAuth();
    const [usage, setUsage] = React.useState(null);
    const [recentCampaigns, setRecentCampaigns] = React.useState([]);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [u, campaignsData] = await Promise.all([
                    billingApi.usage(),
                    campaignApi.listCampaigns(5),
                ]);
                setUsage(u);
                setRecentCampaigns(campaignsData);
            } catch (error) {
                console.error('Sidebar data fetch failed', error);
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    const sends = usage?.sends_today || { used: 0, limit: 200 };
    const pct = sends.limit ? Math.min(100, Math.round((sends.used / sends.limit) * 100)) : 0;
    const planName = usage?.plan_name || 'Free';

    return (
        <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r bg-card">
            {/* Brand */}
            <div className="flex items-center gap-3 px-6 py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-primary/20">
                    <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-bold tracking-tight">
                        {workspace?.name || 'Nudge'}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {planName} plan
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3">
                <nav className="space-y-6 py-2">
                    <NavGroup label="Campaigns">
                        <SidebarItem to="/" icon={Send} label="New Campaign" />
                        <SidebarItem
                            to={id ? `/approval/${id}` : '#'}
                            icon={CheckSquare}
                            label="Review & Approve"
                            disabled={!id}
                        />
                        <SidebarItem to={id ? `/dashboard/${id}` : '/dashboard'} icon={LayoutDashboard} label="Analytics" />
                    </NavGroup>

                    <NavGroup label="Conversations">
                        <SidebarItem to="/inbox" icon={MessageSquare} label="Inbox" />
                        <SidebarItem to="/leads" icon={Target} label="Leads" />
                    </NavGroup>

                    <NavGroup label="Audience">
                        <SidebarItem to="/contacts" icon={Users} label="Contacts" />
                        <SidebarItem to="/lists" icon={ListChecks} label="Contact Lists" />
                        <SidebarItem to="/templates" icon={FileText} label="Templates" />
                    </NavGroup>

                    <NavGroup label="Account">
                        <SidebarItem to="/billing" icon={CreditCard} label="Plan & Billing" />
                        <SidebarItem to="/settings" icon={Settings} label="Settings" />
                    </NavGroup>

                    {recentCampaigns.length > 0 && (
                        <NavGroup label="Recent Campaigns">
                            {recentCampaigns.map((c) => (
                                <NavLink
                                    key={c.id}
                                    to={`/dashboard/${c.id}`}
                                    className={({ isActive }) =>
                                        cn(
                                            'block truncate rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                                            isActive || id === c.id
                                                ? 'bg-accent text-primary'
                                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                        )
                                    }
                                >
                                    {c.name || (c.brief || '').substring(0, 30) + '…'}
                                </NavLink>
                            ))}
                        </NavGroup>
                    )}
                </nav>
            </ScrollArea>

            {/* Plan usage widget */}
            <div className="p-3">
                <div className="rounded-xl border bg-muted/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Plan usage
                        </span>
                        <NavLink to="/billing">
                            <Badge variant={pct > 90 ? 'destructive' : 'success'} className="text-[10px]">
                                {planName}
                            </Badge>
                        </NavLink>
                    </div>
                    <Progress
                        value={pct}
                        indicatorClassName={pct > 90 ? 'bg-destructive' : 'bg-primary'}
                    />
                    <p className="mt-3 flex justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
                        <span>
                            {sends.used} / {sends.limit} sends today
                        </span>
                        <span>Resets daily</span>
                    </p>
                </div>
            </div>
        </aside>
    );
}
