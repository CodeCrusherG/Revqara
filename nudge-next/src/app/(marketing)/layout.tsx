import Link from "next/link";
import { Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MarketingAuthControls } from "@/components/marketing/auth-controls";
import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";

/**
 * Public marketing shell. Edge-safe (no Appwrite, no server-only imports), with
 * Clerk-aware auth controls that fall back to plain links when keys are absent.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkThemeProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-lg tracking-tight">Revqara</span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
              <Link href="/pricing" className="transition-colors hover:text-foreground">
                Pricing
              </Link>
              <Link href="/demo" className="transition-colors hover:text-foreground">
                Live demo
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <MarketingAuthControls />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border/60">
          <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground md:flex-row">
            <p>© {new Date().getFullYear()} Revqara. Built for Indian SMBs.</p>
            <div className="flex items-center gap-6">
              <Link href="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
              <Link href="/demo" className="hover:text-foreground">
                Demo
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </ClerkThemeProvider>
  );
}
