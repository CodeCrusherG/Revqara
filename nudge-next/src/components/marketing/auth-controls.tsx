"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

const HAS_CLERK_KEY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function MarketingAuthControls() {
  if (!HAS_CLERK_KEY) {
    return (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/sign-up">Get started</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="redirect">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="redirect">
          <Button size="sm">Get started</Button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton appearance={{ elements: { avatarBox: "size-8" } }} />
      </SignedIn>
    </>
  );
}
