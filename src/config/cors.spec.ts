import { isAllowedOrigin, parseAllowedOrigins } from "@/config/cors";

describe("isAllowedOrigin", () => {
  const configured = ["https://m300.energymrc.ng"];

  it("allows the configured production origin", () => {
    expect(isAllowedOrigin("https://m300.energymrc.ng", configured, false)).toBe(true);
  });

  it("allows any vercel.app subdomain regardless of environment", () => {
    expect(isAllowedOrigin("https://m300-frontend-git-feature-x.vercel.app", configured, false)).toBe(true);
    expect(isAllowedOrigin("https://m300-frontend-git-feature-x.vercel.app", configured, true)).toBe(true);
  });

  it("allows localhost on any port only in development", () => {
    expect(isAllowedOrigin("http://localhost:5143", configured, true)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", configured, true)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", configured, true)).toBe(true);
  });

  it("rejects localhost outside development (WEB-013)", () => {
    expect(isAllowedOrigin("http://localhost:5173", configured, false)).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:3000", configured, false)).toBe(false);
  });

  it("allows requests with no Origin header (server-to-server, curl)", () => {
    expect(isAllowedOrigin(undefined, configured, false)).toBe(true);
  });

  it("rejects an unrelated origin", () => {
    expect(isAllowedOrigin("https://evil.example.com", configured, false)).toBe(false);
  });

  it("rejects a malformed origin", () => {
    expect(isAllowedOrigin("not-a-url", configured, false)).toBe(false);
  });
});

describe("parseAllowedOrigins", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseAllowedOrigins(" https://a.com , https://b.com ,")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("returns an empty array when unset", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});
