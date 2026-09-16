"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Network,
  Send,
  Settings,
  Sparkles,
  Target,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { EASE } from "@/components/motion/pageVariants";
import { PlanUsageWidget } from "@/components/layout/plan-usage-widget";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  P_REPORTS,
  P_TEAM_MANAGE,
  type Permission,
} from "@/lib/auth/rbac";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  exact?: boolean;
  /** When set, the item is hidden unless the role holds the permission. */
  perm?: Permission;
};

type NavGroup = { label: string; items: NavItem[] };

/** Mirrors frontend/src/components/layout/app-sidebar.jsx NAV groups. */
const NAV: NavGroup[] = [
  {
    label: "Campaigns",
    items: [
      { title: "New Campaign", url: "/new", icon: Send, exact: true },
      { title: "Analytics", url: "/dashboard", icon: LayoutDashboard, perm: P_REPORTS },
    ],
  },
  {
    label: "Conversations",
    items: [
      { title: "Inbox", url: "/inbox", icon: MessageSquare },
      { title: "Leads", url: "/leads", icon: Target },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "Members", url: "/team", icon: UsersRound },
      { title: "Sales Teams", url: "/sales-teams", icon: Network, perm: P_TEAM_MANAGE },
    ],
  },
  {
    label: "Audience",
    items: [
      { title: "Contacts", url: "/contacts", icon: Users },
      { title: "Lists", url: "/lists", icon: ListChecks },
      { title: "Templates", url: "/templates", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Billing", url: "/billing", icon: CreditCard },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export interface AppSidebarProps {
  perms: ReadonlySet<string>;
  plan: string;
  workspaceName?: string;
  /** Live sends-today usage (from usageSummary) for the PlanUsageWidget. */
  sendsToday?: number;
  /** Live effective-plan sends/day limit for the PlanUsageWidget. */
  sendsLimit?: number;
}

export function AppSidebar({
  perms,
  plan,
  workspaceName,
  sendsToday,
  sendsLimit,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { state } = useSidebar();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.url : pathname.startsWith(item.url);

  const visible = (item: NavItem) => !item.perm || perms.has(item.perm);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Revqara</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {workspaceName || "WhatsApp CRM"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Clerk workspace (organization) switcher. */}
        <div className="px-1 group-data-[collapsible=icon]:hidden">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/onboarding"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-between rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-sm",
              },
            }}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = isActive(item);
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="relative"
                        >
                          <Link href={item.url}>
                            {active && (
                              <motion.span
                                layoutId="sidebar-active"
                                className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
                                transition={{ duration: 0.2, ease: EASE }}
                              />
                            )}
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {state === "expanded" && (
          <PlanUsageWidget
            plan={plan}
            sendsToday={sendsToday}
            sendsLimit={sendsLimit}
          />
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md p-1 group-data-[collapsible=icon]:justify-center">
              <UserButton
                appearance={{ elements: { avatarBox: "size-8 rounded-lg" } }}
              />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold capitalize">
                  {plan} plan
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Account
                </span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
