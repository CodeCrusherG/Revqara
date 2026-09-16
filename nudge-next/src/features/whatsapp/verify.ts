/**
 * Meta webhook verification — the one genuinely new security step vs. the old
 * unsigned simulator (plan §5).
 *
 *   - verifyChallenge: the GET hub-challenge handshake against
 *     WHATSAPP_VERIFY_TOKEN.
 *   - verifyMetaSignature: timing-safe HMAC-SHA256 of the RAW request body
 *     against WHATSAPP_APP_SECRET, compared to the `X-Hub-Signature-256` header
 *     (`sha256=<hex>`). A bad/missing signature ⇒ 403 at the route.
 *
 * Pure + dependency-light (node:crypto only) so it is unit-testable and runs in
 * the node runtime. Never throws on malformed input — returns false.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GET verify handshake. Returns the `hub.challenge` to echo when the mode is
 * `subscribe` and the token matches `expectedToken`; otherwise `null` (→ 403).
 */
export function verifyChallenge(
  params: {
    mode?: string | null;
    token?: string | null;
    challenge?: string | null;
  },
  expectedToken: string,
): string | null {
  const { mode, token, challenge } = params;
  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    return challenge ?? "";
  }
  return null;
}

/**
 * Timing-safe HMAC-SHA256 verification of the raw body against the
 * `X-Hub-Signature-256` header. `header` looks like `sha256=<hexdigest>`.
 *
 * Returns false (never throws) on any missing input, malformed header, or length
 * mismatch — the route maps a false to 403.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!header || !appSecret) return false;

  const [scheme, signature] = header.split("=");
  if (scheme !== "sha256" || !signature) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expectedHex = createHmac("sha256", appSecret).update(body).digest("hex");

  // Compare hex strings as bytes; length-guard before timingSafeEqual (which
  // throws on unequal-length buffers).
  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length || provided.length === 0) return false;

  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}
