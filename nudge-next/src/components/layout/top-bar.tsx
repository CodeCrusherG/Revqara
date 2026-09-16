"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { UserButton } from "@clerk/nextjs";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useCommandMenu } from "@/components/layout/command-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Pretty labels for top-level route segments (parity with the sidebar nav). */
const SEGMENT_LABELS: Record<string, string> = {
  "": "Home",
  dashboard: "Analytics",
  inbox: "Inbox",
  leads: "Leads",
  team: "Members",
  "sales-teams": "Sales Teams",
  contacts: "Contacts",
  lists: "Lists",
  templates: "Templates",
  billing: "Billing",
  settings: "Settings",
  onboarding: "Onboarding",
};

function labelFor(segment: string): string {
  return (
    SEGMENT_LABELS[segment] ??
    segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function useCrumbs() {
  const pathname = usePathname();
  return React.useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return [{ label: "New Campaign", href: "/", isLast: true }];
    }
    let acc = "";
    return parts.map((part, idx) => {
      acc += `/${part}`;
      return {
        label: labelFor(part),
        href: acc,
        isLast: idx === parts.length - 1,
      };
    });
  }, [pathname]);
}

export function TopBar() {
  const { setOpen } = useCommandMenu();
  const crumbs = useCrumbs();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-1 h-5" />

      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          {crumbs.map((crumb) => (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem>
                {crumb.isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!crumb.isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Open command menu"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <UserButton
          appearance={{ elements: { avatarBox: "size-8" } }}
        />
      </div>
    </header>
  );
}
