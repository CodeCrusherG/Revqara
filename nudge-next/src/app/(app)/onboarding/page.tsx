import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { OnboardingForm } from "./onboarding-form";

/**
 * First-run onboarding: create the first workspace (Clerk Organization) and
 * pick a vertical. If the user already has an active org we bounce them to the
 * app home.
 *
 * BUILD-SAFETY: forced dynamic — reads Clerk `auth()`.
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  if (orgId) {
    redirect("/");
  }
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-lg items-center px-4 py-10">
      <OnboardingForm />
    </div>
  );
}
