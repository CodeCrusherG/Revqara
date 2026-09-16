/**
 * Unit tests for the pure webhook helpers: normalizePhone, verifyMetaSignature /
 * verifyChallenge (the new signed-inbound security step), and the Meta payload
 * parser (statuses dropped, media→null text, profile-name attach), plus a
 * signed round-trip through buildInboundPayload → verifyMetaSignature.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { normalizePhone } from "../normalize";
import { verifyChallenge, verifyMetaSignature } from "../verify";
import { buildInboundPayload, parseInboundMessages } from "../parse";

describe("normalizePhone", () => {
  it("keeps digits only, falls back to original, passes null/empty through", () => {
    expect(normalizePhone("+91 93407-75853")).toBe("919340775853");
    expect(normalizePhone("919340775853")).toBe("919340775853");
    expect(normalizePhone("abc")).toBe("abc"); // no digits → original
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeUndefined();
    expect(normalizePhone("")).toBe("");
  });
});

describe("verifyChallenge", () => {
  it("echoes the challenge on a matching subscribe handshake; null otherwise", () => {
    expect(
      verifyChallenge({ mode: "subscribe", token: "secret", challenge: "1234" }, "secret"),
    ).toBe("1234");
    expect(
      verifyChallenge({ mode: "subscribe", token: "wrong", challenge: "1234" }, "secret"),
    ).toBeNull();
    expect(
      verifyChallenge({ mode: "unsubscribe", token: "secret", challenge: "1234" }, "secret"),
    ).toBeNull();
  });
});

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ hello: "world" });
  const goodHeader =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature, rejects tampered body / wrong secret / malformed header", () => {
    expect(verifyMetaSignature(body, goodHeader, secret)).toBe(true);
    expect(verifyMetaSignature(body + "x", goodHeader, secret)).toBe(false);
    expect(verifyMetaSignature(body, goodHeader, "other-secret")).toBe(false);
    expect(verifyMetaSignature(body, "garbage", secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, goodHeader, "")).toBe(false);
    expect(verifyMetaSignature(body, "md5=abc", secret)).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  it("extracts text messages, attaches profile name, drops statuses", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "919000", profile: { name: "Asha" } }],
                messages: [
                  { id: "wamid.1", from: "919000", type: "text", text: { body: "hi" } },
                ],
              },
            },
            {
              // statuses-only change → ignored.
              value: {
                metadata: { phone_number_id: "PN1" },
                statuses: [{ id: "wamid.x", status: "delivered" }],
              },
            },
          ],
        },
      ],
    };
    const msgs = parseInboundMessages(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "wamid.1",
      phoneNumberId: "PN1",
      from: "919000",
      name: "Asha",
      text: "hi",
      type: "text",
    });
  });

  it("yields null text for media / unsupported types", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN1" },
                messages: [{ id: "wamid.2", from: "919001", type: "image" }],
              },
            },
          ],
        },
      ],
    };
    const msgs = parseInboundMessages(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBeNull();
    expect(msgs[0].type).toBe("image");
  });

  it("returns [] on a malformed payload (never throws)", () => {
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages({})).toEqual([]);
    expect(parseInboundMessages({ entry: "nope" })).toEqual([]);
  });
});

describe("signed round-trip (dev-inject parity)", () => {
  it("buildInboundPayload signs and verifies against the same secret", () => {
    const secret = "local-secret";
    const payload = buildInboundPayload({
      phoneNumberId: "PN9",
      from: "919555",
      name: "Dev User",
      text: "what is the price?",
    });
    const raw = JSON.stringify(payload);
    const header = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyMetaSignature(raw, header, secret)).toBe(true);

    const msgs = parseInboundMessages(payload);
    expect(msgs[0]).toMatchObject({
      phoneNumberId: "PN9",
      from: "919555",
      name: "Dev User",
      text: "what is the price?",
    });
  });
});
