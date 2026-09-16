import { SignIn } from "@clerk/nextjs";

/**
 * Clerk hosted sign-in. BUILD-SAFETY: forced dynamic — the Clerk component must
 * not be prerendered without real keys.
 */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        elements: {
          rootBox: "mx-auto w-full max-w-full min-w-0 overflow-hidden",
          card:
            "w-full max-w-full min-w-0 border-0 bg-transparent p-4 shadow-none sm:p-6 [&_.cl-cardBox]:max-w-full [&_.cl-headerSubtitle]:text-sm [&_.cl-headerTitle]:text-2xl [&_.cl-headerTitle]:font-semibold",
          socialButtonsBlockButton:
            "h-11 rounded-md border-border bg-background text-foreground shadow-sm",
          formButtonPrimary: "h-11 rounded-md text-sm font-semibold shadow-sm",
          formFieldInput:
            "h-11 rounded-md border-border bg-background text-foreground shadow-sm",
          footer: "hidden",
        },
      }}
    />
  );
}
