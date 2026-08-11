import { describe, expect, it } from "vitest";
import {
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
} from "./platform-admin";

describe("platform-admin allowlist", () => {
  it("parses comma-separated emails case-insensitively", () => {
    expect([...parsePlatformAdminEmails(" A@X.com , b@y.com ")].sort()).toEqual(
      ["a@x.com", "b@y.com"],
    );
  });

  it("empty env → nobody", () => {
    expect(parsePlatformAdminEmails(undefined).size).toBe(0);
    expect(parsePlatformAdminEmails("")).toEqual(new Set());
    expect(isPlatformAdminEmail("a@x.com", undefined)).toBe(false);
  });

  it("matches email against allowlist", () => {
    const env = "atalayyorukoglu@gmail.com";
    expect(isPlatformAdminEmail("atalayyorukoglu@gmail.com", env)).toBe(true);
    expect(isPlatformAdminEmail("AtalayYorukoglu@gmail.com", env)).toBe(true);
    expect(isPlatformAdminEmail("other@example.com", env)).toBe(false);
    expect(isPlatformAdminEmail(null, env)).toBe(false);
  });
});
