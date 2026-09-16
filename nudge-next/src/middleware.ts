import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge auth/tenancy gate (plan §4, request lifecycle step 1).
 *
 * IMPORTANT: this file lives at `src/middleware.ts` (NOT the project root),
 * because this project uses a `src/` directory — Next.js only picks the
 * middleware up here. (A root `middleware.ts` is silently ignored, which makes
 * `clerkMiddleware()` never run and every `auth()` call throw.)
 *
 * Edge-safe by construction: imports ONLY Clerk + next/server (no Appwrite,
 * no node-appwrite, no `server-only` modules). Responsibilities:
 *
 *   1. Public routes — (marketing), (auth), and /api/webhooks(*) — pass through.
 *   2. Protected routes (everything else, i.e. the (app) group + /api/*):
 *      - unauthenticated → redirectToSignIn()
 *      - authed but NO active org → redirect to /onboarding
 *      - membership disabled (org_status session claim) → 403
 *   3. Attach an x-request-id header to every response for tracing.
 *
 * KEYLESS PREVIEW: if Clerk env keys are absent (local preview before SETUP.md
 * is done), Clerk is skipped entirely so the public marketing site still
 * renders. The authenticated (app) routes require real keys to work.
 *
 * The disabled-member check here is the first line; `getRequestContext()`
 * re-checks server-side as defense-in-depth.
 */

const HAS_CLERK_KEYS = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const isPublicRoute = createRouteMatcher([
  // (marketing) — public, SSG/ISR
  "/",
  "/pricing",
  "/verticals(.*)",
  "/demo(.*)",
  // (auth) — Clerk hosted flows
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/accept-invite(.*)",
  // external webhooks (own signature verification)
  "/api/webhooks(.*)",
  // health + dev injector guard their own access
  "/api/health(.*)",
  // public marketing demo endpoint
  "/api/demo(.*)",
]);

/** Routes that require an authenticated user AND an active organization. */
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  return res;
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

const clerkGate = clerkMiddleware(async (auth, req) => {
  const requestId = req.headers.get("x-request-id") ?? newRequestId();

  const { userId, orgId, sessionClaims, redirectToSignIn } = await auth();

  // Root path "/" is the public marketing landing for logged-out visitors, but
  // the app entry for authed users: with an active org → app home (/new);
  // without an org → onboarding. The (app) and (marketing) groups cannot both
  // own "/", so the authed home lives at /new and we bounce here (this also
  // covers Clerk's default post-sign-in redirect to "/").
  if (req.nextUrl.pathname === "/") {
    if (userId && orgId) {
      return withRequestId(NextResponse.redirect(new URL("/new", req.url)), requestId);
    }
    if (userId && !orgId) {
      return withRequestId(NextResponse.redirect(new URL("/onboarding", req.url)), requestId);
    }
    return withRequestId(NextResponse.next(), requestId);
  }

  // Other public routes: never gated.
  if (isPublicRoute(req)) {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Unauthenticated → sign-in.
  if (!userId) {
    return redirectToSignIn();
  }

  // Disabled membership → hard 403 (Clerk would otherwise authorize a
  // disabled-but-present member). Surfaced via the `org_status` session claim.
  const orgStatus = (sessionClaims as Record<string, unknown> | undefined)
    ?.org_status;
  if (orgStatus === "disabled") {
    return withRequestId(
      new NextResponse("Your access to this workspace is disabled.", {
        status: 403,
      }),
      requestId,
    );
  }

  // Authed but no active org → onboarding (unless already there).
  if (!orgId && !isOnboardingRoute(req)) {
    const onboardingUrl = new URL("/onboarding", req.url);
    return withRequestId(NextResponse.redirect(onboardingUrl), requestId);
  }

  return withRequestId(NextResponse.next(), requestId);
});

/** Keyless local preview: skip Clerk so the public site still renders. */
function previewPassthrough(req: NextRequest): NextResponse {
  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  return withRequestId(NextResponse.next(), requestId);
}

export default HAS_CLERK_KEYS ? clerkGate : previewPassthrough;

export const config = {
  matcher: [
    // Skip Next internals and static assets unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
