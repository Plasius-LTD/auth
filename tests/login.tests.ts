import { describe, expect, it, vi } from "vitest";
import { encodeLoginReturnTo, useLogin } from "../src/lib/login.js";

describe("login return-path encoding", () => {
  it("encodes Unicode paths as unpadded RFC 4648 base64url", () => {
    const encoded = encodeLoginReturnTo("/café/✓?tab=one");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe("/café/✓?tab=one");
  });

  it("uses the encoded path in provider redirects", async () => {
    const location = { pathname: "/café/✓", href: "" };
    vi.stubGlobal("window", { location });
    try {
      await useLogin()("google" as never);
      expect(location.href).toContain(`state=${encodeLoginReturnTo(location.pathname)}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
