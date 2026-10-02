import { afterEach, describe, expect, it, vi } from "vitest";
import { createConferenceSession } from "./conferenceApi.js";
vi.mock("../config/runtimeConfig.js", () => ({ getApiBaseUrl: () => "https://api.example" }));
afterEach(() => vi.unstubAllGlobals());

describe("conference requests", () => {
  it("counts one visit across repeated calls and reuses submission ID after a lost response", async () => {
    const bodies = [];
    let fail = true;
    const fetchMock = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body); bodies.push({ url, body });
      if (url.endsWith("visit")) return { ok: true, json: async () => ({ ok: true, token: "signed" }) };
      if (fail) { fail = false; throw new TypeError("Network lost"); }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = createConferenceSession();
    await Promise.all([session.visit(), session.visit()]);
    const fields = { name: "Test", email: "test@example.com", consent: true, followupConsent: false };
    await expect(session.submit(fields)).rejects.toThrow("could not confirm");
    await session.submit(fields);
    expect(bodies.filter((call) => call.url.endsWith("visit"))).toHaveLength(1);
    const submissions = bodies.filter((call) => call.url.endsWith("leads"));
    expect(submissions[0].body.requestId).toBe(submissions[1].body.requestId);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });
});
