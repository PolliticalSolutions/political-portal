import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../src/lib/jwt.mjs";

const SECRET = "test-secret-must-be-long-enough-for-hmac";

describe("jwt — sign + verify roundtrip", () => {
  it("verifies a token signed with the same secret", () => {
    const token = signToken({ volunteer_id: "v1", session_id: "s1", type: "rsvp" }, SECRET);
    const payload = verifyToken(token, SECRET);
    expect(payload.volunteer_id).toBe("v1");
    expect(payload.session_id).toBe("s1");
    expect(payload.type).toBe("rsvp");
    expect(typeof payload.iat).toBe("number");
  });

  it("adds an `exp` claim when expiresInSeconds is provided", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signToken({ volunteer_id: "v1", type: "unsubscribe" }, SECRET, { expiresInSeconds: 600 });
    const payload = verifyToken(token, SECRET);
    expect(payload.exp).toBeGreaterThanOrEqual(before + 600);
  });
});

describe("jwt — rejection paths", () => {
  it("rejects a token signed with a different secret", () => {
    const token = signToken({ x: 1 }, SECRET);
    expect(() => verifyToken(token, "other-secret")).toThrow(/signature/i);
  });

  it("rejects an expired token and sets err.expired", () => {
    // Sign with exp in the past by encoding manually via a 1-second TTL and waiting.
    const token = signToken({ x: 1, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
    let caught;
    try { verifyToken(token, SECRET); } catch (err) { caught = err; }
    expect(caught).toBeDefined();
    expect(caught.expired).toBe(true);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyToken("not.a.valid.token.with.too.many.parts", SECRET)).toThrow(/malformed/i);
    expect(() => verifyToken("only-two.parts", SECRET)).toThrow(/malformed/i);
  });

  it("rejects a tampered payload", () => {
    const token = signToken({ volunteer_id: "v1" }, SECRET);
    // Tamper: flip a character in the payload segment.
    const parts = token.split(".");
    const tampered = parts[1].length > 0
      ? `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].slice(-1) === "A" ? "B" : "A"}.${parts[2]}`
      : token;
    expect(() => verifyToken(tampered, SECRET)).toThrow();
  });

  it("rejects when secret is missing", () => {
    const token = signToken({ x: 1 }, SECRET);
    expect(() => verifyToken(token, "")).toThrow(/secret/i);
    expect(() => signToken({ x: 1 }, "")).toThrow(/secret/i);
  });
});
