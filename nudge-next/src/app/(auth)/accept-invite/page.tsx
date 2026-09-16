import { OrganizationList, SignedIn, SignedOut, SignUp } from "@clerk/nextjs";

/**
 * Organization invitation accept flow (Clerk Organization Invitations replace
 * the old WorkspaceInvite + raw-token endpoint).
 *
 * - Signed-out recipients land here from the email link carrying a
 *   `__clerk_ticket`; <SignUp> consumes the ticket and joins the org on
 *   account creation.
 * - Signed-in recipients see <OrganizationList>, which surfaces their pending
 *   invitations to accept and switches the active org on accept.
 *
 * BUILD-SAFETY: forced dynamic — Clerk components must not be prerendered
 * without real keys.
 */
export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <div className="w-full">
      <SignedOut>
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto w-full max-w-full min-w-0 overflow-hidden",
              card:
                "w-full max-w-full min-w-0 border-0 bg-transparent p-4 shadow-none sm:p-6 [&_.cl-cardBox]:max-w-full [&_.cl-headerSubtitle]:text-sm [&_.cl-headerTitle]:text-2xl [&_.cl-headerTitle]:font-semibold",
              socialButtonsBlockButton:
                "h-11 rounded-md border-border bg-background text-foreground shadow-sm",
              formButtonPrimary:
                "h-11 rounded-md text-sm font-semibold shadow-sm",
              formFieldInput:
                "h-11 rounded-md border-border bg-background text-foreground shadow-sm",
              footer: "hidden",
            },
          }}
        />
      </SignedOut>
      <SignedIn>
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Accept your invitation
          </h1>
          <p className="text-sm text-muted-foreground">
            Select the workspace you were invited to join.
          </p>
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/onboarding"
            appearance={{ elements: { rootBox: "mx-auto" } }}
          />
        </div>
      </SignedIn>
    </div>
  );
}
