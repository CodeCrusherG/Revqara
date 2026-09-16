import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";

const proofPoints = [
  { label: "Vertical-aware inbox", icon: MessageSquareText },
  { label: "Campaign approvals", icon: CheckCircle2 },
  { label: "Team workspaces", icon: UsersRound },
];

const metrics = [
  { label: "Lead signals", value: "24/7", tone: "text-cyan-600 dark:text-cyan-300" },
  { label: "Review flow", value: "2-step", tone: "text-primary" },
  { label: "Templates", value: "90+", tone: "text-amber-600 dark:text-amber-300" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkThemeProvider>
      <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
        <div className="fixed inset-0 -z-10 bg-grid opacity-[0.18] bg-grid-fade" />
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
            aria-label="Revqara home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>Revqara</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Back home
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto grid min-h-[calc(100vh-4.25rem)] w-full max-w-[100vw] items-center gap-8 overflow-hidden px-4 pb-8 pt-3 sm:px-6 sm:pb-12 lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] lg:gap-14 lg:px-8 lg:pt-0">
          <section className="hidden lg:block">
            <div className="max-w-2xl space-y-8">
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                <ShieldCheck className="h-4 w-4" />
                Secure access for revenue teams
              </div>

              <div className="space-y-5">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
                  Sign in to your WhatsApp growth command center.
                </h1>
                <p className="max-w-xl text-base leading-7 text-muted-foreground">
                  Manage leads, campaigns, approvals, and customer conversations from one workspace built for Indian service businesses.
                </p>
              </div>

              <div className="grid max-w-xl grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-border bg-card/80 p-4 shadow-sm backdrop-blur"
                  >
                    <p className={`text-2xl font-semibold tracking-tight ${metric.tone}`}>
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {metric.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid max-w-xl gap-3">
                {proofPoints.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background/70 px-4 py-3 shadow-sm backdrop-blur"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mx-auto w-[calc(100vw-4rem)] max-w-[27rem] min-w-0 justify-self-center min-[440px]:w-[calc(100vw-2rem)] sm:w-full lg:max-w-[29rem]">
            <div className="mb-5 space-y-3 text-center lg:hidden">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Workflow className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome to Revqara
                </h1>
                <p className="mx-auto max-w-[16rem] text-sm leading-6 text-muted-foreground sm:max-w-xs">
                  Access your AI inbox, campaigns, and team workspace.
                </p>
              </div>
            </div>

            <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-card/95 p-2 shadow-xl shadow-black/5 backdrop-blur dark:shadow-black/30 sm:p-3">
              <div className="min-h-[18rem] w-full max-w-full min-w-0 overflow-hidden sm:min-h-[30rem]">
                {children}
              </div>
            </div>

            <div className="mt-5 grid min-w-0 grid-cols-2 gap-2 text-center text-[11px] font-medium text-muted-foreground min-[440px]:grid-cols-3 sm:text-xs">
              <span className="min-w-0 rounded-md border border-border bg-background/70 px-1.5 py-2 sm:px-2">
                <ShieldCheck className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />
                Secure
              </span>
              <span className="min-w-0 rounded-md border border-border bg-background/70 px-1.5 py-2 sm:px-2">
                <MessageSquareText className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
                WhatsApp
              </span>
              <span className="hidden min-w-0 rounded-md border border-border bg-background/70 px-1.5 py-2 min-[440px]:block sm:px-2">
                <BarChart3 className="mx-auto mb-1 h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                Insights
              </span>
            </div>
          </section>
        </main>
      </div>
    </ClerkThemeProvider>
  );
}
