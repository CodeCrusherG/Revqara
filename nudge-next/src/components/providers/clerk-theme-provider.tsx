"use client";

import * as React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark, shadcn } from "@clerk/ui/themes";
import { useTheme } from "next-themes";

/**
 * Wires Clerk's hosted-UI appearance to the active next-themes value so the
 * sign-in/up and Organization widgets match light/dark. Must be a Client
 * Component because it reads `useTheme()`; it renders below ThemeProvider.
 *
 * Brand: emerald `#10b981` primary, 0.75rem radius.
 *
 * KEYLESS PREVIEW: when no publishable key is set, do NOT mount ClerkProvider.
 * Clerk v6's keyless dev mode renders a helper that calls React 19's
 * `useActionState`, which throws on our React 18. Skipping the provider keeps
 * local preview from crashing; with a real key it mounts normally (React-18
 * safe). The authenticated (app) routes still need real keys to function.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (!PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? [shadcn, dark] : shadcn,
        variables: {
          colorPrimary: "#10b981",
          borderRadius: "0.75rem",
        },
        elements: {
          card: "shadow-lg",
          footer: "hidden",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
