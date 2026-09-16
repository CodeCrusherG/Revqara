import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Sparkles, Send, LayoutDashboard, MessageSquare, Target, Users, ListChecks,
    FileText, CreditCard, Settings, ChevronsUpDown, LogOut, Sun, Moon,
    UsersRound, Network, Check, Building2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/context/AuthContext';
import { workspacesApi } from '@/services/api';
import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
    SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from '@/components/ui/sidebar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const NAV = [
    {
        label: 'Campaigns',
        items: [
            { title: 'New Campaign', url: '/', icon: Send, exact: true },
            { title: 'Analytics', url: '/dashboard', icon: LayoutDashboard },
        ],
    },
    {
        label: 'Conversations',
        items: [
            { title: 'Inbox', url: '/inbox', icon: MessageSquare },
            { title: 'Leads', url: '/leads', icon: Target },
        ],
    },
    {
        label: 'Team',
        items: [
            { title: 'Members', url: '/team', icon: UsersRound },
            { title: 'Sales Teams', url: '/sales-teams', icon: Network },
        ],
    },
    {
        label: 'Audience',
        items: [
            { title: 'Contacts', url: '/contacts', icon: Users },
            { title: 'Contact Lists', url: '/lists', icon: ListChecks },
            { title: 'Templates', url: '/templates', icon: FileText },
        ],
    },
    {
        label: 'Account',
        items: [
            { title: 'Plan & Billing', url: '/billing', icon: CreditCard },
            { title: 'Settings', url: '/settings', icon: Settings },
        ],
    },
];

function initials(s) {
    return (s || '?').trim().slice(0, 2).toUpperCase();
}

export function AppSidebar() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { user, workspace, role, logout, switchWorkspace } = useAuth();
    const { theme, setTheme } = useTheme();
    const [workspaces, setWorkspaces] = useState([]);

    useEffect(() => {
        workspacesApi.list().then((d) => setWorkspaces(d.workspaces || [])).catch(() => {});
    }, [workspace?.id]);

    const isActive = (item) => (item.exact ? pathname === item.url : pathname.startsWith(item.url));

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild className="data-[state=open]:bg-sidebar-accent">
                            <Link to="/">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                                    <Sparkles className="size-4" />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">Nudge</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {workspace?.name || 'WhatsApp CRM'}
                                    </span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {NAV.map((group) => (
                    <SidebarGroup key={group.label}>
                        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                        <SidebarMenu>
                            {group.items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                                        <Link to={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                                    <Avatar className="size-8 rounded-lg">
                                        <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold">
                                            {initials(user?.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold">{user?.email || 'Account'}</span>
                                        <span className="truncate text-xs capitalize text-muted-foreground">
                                            {workspace?.plan || 'free'} plan
                                        </span>
                                    </div>
                                    <ChevronsUpDown className="ms-auto size-4" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-60 rounded-lg" side="right" align="end" sideOffset={4}>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col">
                                        <span className="truncate text-sm font-semibold">{workspace?.name}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {user?.email}{role ? ` · ${role}` : ''}
                                        </span>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
                                {workspaces.map((w) => (
                                    <DropdownMenuItem key={w.id} onClick={() => w.id !== workspace?.id && switchWorkspace(w.id)}>
                                        <Building2 className="size-4" />
                                        <span className="flex-1 truncate">{w.name}</span>
                                        {w.id === workspace?.id && <Check className="size-4 text-primary" />}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate('/billing')}>
                                    <CreditCard className="size-4" /> Plan & billing
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                                    {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                                    Toggle theme
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                                    <LogOut className="size-4" /> Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
