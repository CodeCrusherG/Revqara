/**
 * Rate limiting — a tiny token-bucket abstraction with a zero-dependency
 * in-memory default and an optional Upstash Redis adapter.
 *
 * WHY an abstraction: the public surfaces that need throttling (`/api/demo`,
 * `/api/dev/inject`) must work on a fresh checkout with NO infra and NO extra
 * npm dependency. So the default limiter is a per-key in-memory token bucket
 * (best-effort: it resets on cold start and is per-instance, which is fine for
 * abuse-dampening on a single-region deploy or local dev).
 *
 * UPSTASH (optional, drop-in): when `UPSTASH_REDIS_REST_URL` (and token) are
 * set, `getRateLimiter()` will try to load `@upstash/ratelimit` + `@upstash/redis`
 * via a guarded **dynamic import**. We never `import` those packages at module
 * top-level, so the build stays green even though they are NOT in package.json.
 * If the dynamic import fails (package absent), we log once and transparently
 * fall back to the in-memory limiter — the app keeps working.
 *
 * To actually enable the distributed limiter, install the (optional) packages:
 *     npm i @upstash/ratelimit @upstash/redis
 * and set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. No code change.
 *
 * The contract is intentionally a subset of Upstash's `Ratelimit.limit()` so the
 * adapter is a straight pass-through.
 */

import "server-only";

import { logger } from "@/lib/logger";

const log = logger.child({ mod: "ratelimit" });

/** Result of a `limit()` check — mirrors the Upstash Ratelimit shape. */
export interface RateLimitResult {
  /** False when the request should be rejected (HTTP 429). */
  success: boolean;
  /** Configured ceiling for the window. */
  limit: number;
  /** Tokens left in the current window after this request. */
  remaining: number;
  /** Epoch ms at which the window resets (best-effort for in-memory). */
  reset: number;
}

/** The limiter contract used by routes. Both adapters implement it. */
export interface RateLimiter {
  /** Consume one token for `key`; returns whether the request is allowed. */
  limit(key: string): Promise<RateLimitResult>;
}

export interface TokenBucketOptions {
  /** Max requests allowed per window. */
  tokens: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Namespace so independent buckets (per route) never collide on a key. */
  prefix?: string;
}

// ── In-memory token bucket (default, no deps) ────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * A best-effort, per-process token bucket. Buckets live in a module-level Map;
 * a tiny opportunistic sweep evicts expired entries so the Map cannot grow
 * unbounded under key churn (e.g. per-IP keys). Never throws.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly tokens: number;
  private readonly windowMs: number;
  private readonly prefix: string;
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(opts: TokenBucketOptions) {
    this.tokens = Math.max(1, opts.tokens);
    this.windowMs = Math.max(1, opts.windowMs);
    this.prefix = opts.prefix ? `${opts.prefix}:` : "";
  }

  private sweep(now: number): void {
    // Sweep at most once per window to keep `limit()` O(1) amortized.
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) {
      if (now > b.resetAt) this.buckets.delete(k);
    }
  }

  limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    this.sweep(now);

    const k = this.prefix + key;
    const existing = this.buckets.get(k);

    if (!existing || now > existing.resetAt) {
      const resetAt = now + this.windowMs;
      this.buckets.set(k, { count: 1, resetAt });
      return Promise.resolve({
        success: true,
        limit: this.tokens,
        remaining: this.tokens - 1,
        reset: resetAt,
      });
    }

    existing.count += 1;
    const remaining = this.tokens - existing.count;
    return Promise.resolve({
      success: remaining >= 0,
      limit: this.tokens,
      remaining: Math.max(0, remaining),
      reset: existing.resetAt,
    });
  }
}

// ── Upstash adapter (optional; lazy, guarded — package may be absent) ─────────

/**
 * Wrap an Upstash `Ratelimit` instance behind our {@link RateLimiter} contract.
 * Typed against `unknown` because the package is not a compile-time dependency.
 */
class UpstashRateLimiter implements RateLimiter {
  // The Upstash instance — kept as `unknown`-shaped to avoid a type dependency.
  private readonly rl: { limit: (key: string) => Promise<RateLimitResult> };

  constructor(rl: { limit: (key: string) => Promise<RateLimitResult> }) {
    this.rl = rl;
  }

  async limit(key: string): Promise<RateLimitResult> {
    // Upstash returns the same {success,limit,remaining,reset} shape.
    return this.rl.limit(key);
  }
}

function upstashConfigured(): boolean {
  return (
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Attempt to build an Upstash-backed limiter. Returns null (and logs once) when
 * the optional packages are not installed or construction fails, so the caller
 * falls back to in-memory. The dynamic import is wrapped so bundlers/`tsc` never
 * try to resolve a possibly-absent module at build time.
 */
async function tryBuildUpstash(
  opts: TokenBucketOptions,
): Promise<RateLimiter | null> {
  try {
    // Indirect specifiers so the bundler does not statically resolve them.
    const ratelimitMod = (await import(
      /* webpackIgnore: true */ "@upstash/ratelimit" as string
    )) as {
      Ratelimit: new (cfg: Record<string, unknown>) => {
        limit: (key: string) => Promise<RateLimitResult>;
      };
      // slidingWindow / fixedWindow factories live on the class statically.
    };
    const redisMod = (await import(
      /* webpackIgnore: true */ "@upstash/redis" as string
    )) as {
      Redis: { fromEnv: () => unknown };
    };

    const Ratelimit = ratelimitMod.Ratelimit as unknown as {
      new (cfg: Record<string, unknown>): {
        limit: (key: string) => Promise<RateLimitResult>;
      };
      slidingWindow: (tokens: number, window: string) => unknown;
    };

    const redis = redisMod.Redis.fromEnv();
    const seconds = Math.max(1, Math.round(opts.windowMs / 1000));
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.tokens, `${seconds} s`),
      prefix: opts.prefix ? `revqara:${opts.prefix}` : "revqara",
      analytics: false,
    });
    log.info("rate limiter: using Upstash adapter", { prefix: opts.prefix });
    return new UpstashRateLimiter(rl);
  } catch (err) {
    log.warn(
      "rate limiter: Upstash configured but @upstash/* not installed — " +
        "falling back to in-memory. Run `npm i @upstash/ratelimit @upstash/redis`.",
      { err: err instanceof Error ? err.message : String(err) },
    );
    return null;
  }
}

// ── Factory + cache ──────────────────────────────────────────────────────────

const cache = new Map<string, RateLimiter>();

/**
 * Get (or lazily build) a limiter for a named bucket. The first call may resolve
 * the Upstash adapter; subsequent calls for the same prefix return the cached
 * instance. ALWAYS resolves to a working limiter (never throws): if Upstash is
 * configured but unavailable, the in-memory bucket is used.
 *
 * Note: while Upstash is being probed (one tick), concurrent callers transiently
 * receive the in-memory limiter — acceptable for an abuse-dampening control.
 */
export async function getRateLimiter(
  opts: TokenBucketOptions,
): Promise<RateLimiter> {
  const cacheKey = `${opts.prefix ?? "default"}:${opts.tokens}:${opts.windowMs}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // In-memory is the immediate, always-available default.
  const memory: RateLimiter = new InMemoryRateLimiter(opts);
  cache.set(cacheKey, memory);

  if (upstashConfigured()) {
    const upstash = await tryBuildUpstash(opts);
    if (upstash) cache.set(cacheKey, upstash);
    return cache.get(cacheKey)!;
  }

  return memory;
}

/** Extract a best-effort client key (IP) from a request's forwarding headers. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  return req.headers.get("x-real-ip") ?? "anon";
}
