import { z } from "zod";

/**
 * Two zod schemas — server-only secrets vs. NEXT_PUBLIC_* values.
 *
 * Importing `serverEnv` from a client component is a build-time error because
 * the referenced secrets are stripped from the client bundle. Use `publicEnv`
 * (or `process.env.NEXT_PUBLIC_*` directly) on the client.
 *
 * Both schemas parse eagerly at module load so a missing/invalid var fails fast
 * during `next build` rather than at first request.
 */

const optional = z.string().optional().default("");

// ── Server-only schema ───────────────────────────────────────────────────────
const serverSchema = z.object({
  // Clerk
  CLERK_SECRET_KEY: optional,
  CLERK_WEBHOOK_SECRET: optional,

  // Appwrite
  APPWRITE_API_KEY: optional,
  APPWRITE_DATABASE_ID: z.string().default("crm"),

  // Meta WhatsApp Cloud API
  WHATSAPP_VERIFY_TOKEN: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_ACCESS_TOKEN: optional,
  META_GRAPH_VERSION: z.string().default("v21.0"),
  WHATSAPP_MOCK_SEND: optional,
  DEV_INJECT_TOKEN: optional,

  // LLM (optional polish)
  LLM_ENABLED: optional,
  LLM_BASE_URL: optional,
  LLM_MODEL: optional,
  LLM_API_KEY: optional,

  // Razorpay
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  RZP_PLAN_STARTER: optional,
  RZP_PLAN_GROWTH: optional,
  RZP_PLAN_AI_PRO: optional,
  RZP_PLAN_AGENCY: optional,

  // Misc
  APP_BASE_URL: optional,
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  SENTRY_DSN: optional,
});

// ── Client-safe schema (NEXT_PUBLIC_*) ───────────────────────────────────────
const publicSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optional,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_APPWRITE_ENDPOINT: optional,
  NEXT_PUBLIC_APPWRITE_PROJECT_ID: optional,
  NEXT_PUBLIC_APPWRITE_PROJECT_NAME: optional,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: optional,
});

function format(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so they must be referenced as
 * static property accesses for the bundler to replace them.
 */
const rawPublic = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  NEXT_PUBLIC_APPWRITE_PROJECT_NAME:
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_NAME,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
};

const publicParsed = publicSchema.safeParse(rawPublic);
if (!publicParsed.success) {
  throw new Error(
    `Invalid NEXT_PUBLIC_* environment variables:\n${format(publicParsed.error)}`,
  );
}

export const publicEnv = publicParsed.data;
export type PublicEnv = typeof publicEnv;

/**
 * Lazily-validated server env. Accessed via a Proxy so importing this module
 * from a (mis-routed) client bundle does not throw — only first property access
 * on the server triggers validation. Throws fast with a readable report.
 */
let _serverEnv: z.infer<typeof serverSchema> | null = null;

function getServerEnv(): z.infer<typeof serverSchema> {
  if (_serverEnv) return _serverEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${format(parsed.error)}`,
    );
  }
  _serverEnv = parsed.data;
  return _serverEnv;
}

export const serverEnv = new Proxy({} as z.infer<typeof serverSchema>, {
  get(_target, prop: string) {
    if (typeof window !== "undefined") {
      throw new Error(
        `Attempted to access server env var "${prop}" on the client. Use publicEnv / NEXT_PUBLIC_* instead.`,
      );
    }
    return getServerEnv()[prop as keyof z.infer<typeof serverSchema>];
  },
});

export type ServerEnv = z.infer<typeof serverSchema>;
