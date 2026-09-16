/**
 * Tiny structured logger. Emits single-line JSON in production (parseable by
 * log drains) and pretty key/value pairs in development. Safe to import from
 * server or client; no secrets are read here.
 */

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: Level =
  process.env.NODE_ENV === "production" ? "info" : "debug";

const isProd = process.env.NODE_ENV === "production";

function emit(level: Level, msg: string, fields?: Fields) {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  const record = {
    level,
    msg,
    time: new Date().toISOString(),
    ...fields,
  };

  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  if (isProd) {
    sink(JSON.stringify(record));
  } else {
    const extra = fields && Object.keys(fields).length ? fields : "";
    sink(`[${level}] ${msg}`, extra);
  }
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  /** Log an error AND forward it to the error-capture seam (Sentry if wired). */
  captureError(err: unknown, fields?: Fields): void;
  child(bindings: Fields): Logger;
}

// ── Error-capture seam (Sentry-ready, no dependency) ─────────────────────────
//
// `captureError` always logs, and additionally forwards the error to an
// optional sink. The sink is a no-op UNLESS `SENTRY_DSN` is set AND a global
// Sentry client has been registered on `globalThis.__SENTRY_CAPTURE__` (e.g. by
// a `sentry.server.config.ts` that the app may add later). We never `import`
// `@sentry/*` here — the package is not a dependency, so the build stays green.
// To enable: install `@sentry/nextjs`, set SENTRY_DSN, and register a capture
// fn: `globalThis.__SENTRY_CAPTURE__ = (e) => Sentry.captureException(e)`.

type CaptureFn = (err: unknown, context?: Fields) => void;

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_CAPTURE__: CaptureFn | undefined;
}

function captureSink(err: unknown, fields?: Fields): void {
  if (!process.env.SENTRY_DSN) return;
  const sink = globalThis.__SENTRY_CAPTURE__;
  if (typeof sink !== "function") return;
  try {
    sink(err, fields);
  } catch {
    // Never let telemetry break the request path.
  }
}

function toFields(err: unknown, extra?: Fields): Fields {
  if (err instanceof Error) {
    return { err: err.message, stack: err.stack, ...extra };
  }
  return { err: String(err), ...extra };
}

function make(bindings: Fields = {}): Logger {
  return {
    debug: (msg, fields) => emit("debug", msg, { ...bindings, ...fields }),
    info: (msg, fields) => emit("info", msg, { ...bindings, ...fields }),
    warn: (msg, fields) => emit("warn", msg, { ...bindings, ...fields }),
    error: (msg, fields) => emit("error", msg, { ...bindings, ...fields }),
    captureError: (err, fields) => {
      const merged = { ...bindings, ...fields };
      emit(
        "error",
        err instanceof Error ? err.message : "captured error",
        toFields(err, merged),
      );
      captureSink(err, merged);
    },
    child: (extra) => make({ ...bindings, ...extra }),
  };
}

export const logger = make();
