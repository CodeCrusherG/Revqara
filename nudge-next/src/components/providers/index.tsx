"use client";

import * as React from "react";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Root client-side provider tree mounted once in the root layout.
 *
 * Intentionally Clerk-FREE: the marketing route group is public and statically
 * prerendered, so it must not require a Clerk publishableKey at build time.
 * ClerkProvider (via ClerkThemeProvider) is mounted lower, in the (app) and
 * (auth) layouts only. One MotionConfig at the root (never per-page) with
 * `reducedMotion="user"` honors the OS preference for all framer-motion leaves.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionConfig
        reducedMotion="user"
        transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.6 }}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </MotionConfig>
    </ThemeProvider>
  );
}
