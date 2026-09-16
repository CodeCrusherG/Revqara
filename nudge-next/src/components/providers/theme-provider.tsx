"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Version-independent: next-themes moved its exported types around across
// minor versions; derive the props from the component itself.
type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

/**
 * App-wide theme provider. Drives the `.dark` class on <html>; light/dark CSS
 * variables live in globals.css. `attribute="class"` + `enableSystem` match the
 * existing app's behavior.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
