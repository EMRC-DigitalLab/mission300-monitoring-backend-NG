/**
 * Origin allow-list logic for CORS. Trusted previews must be listed explicitly
 * in CORS_ORIGIN; an unrelated Vercel tenant must never gain access.
 *   - a localhost/127.0.0.1 origin, on any port, is allowed ONLY when
 *     `isDevelopment` is true - staging and production must never accept a
 *     request claiming to come from a developer's local machine (WEB-013 in
 *     the audit report: this used to be unconditional, so a `localhost`
 *     entry in CORS_ORIGIN or not, staging/production accepted it anyway).
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
  isDevelopment: boolean,
): boolean {
  if (!origin) return true; // non-browser callers (curl, server-to-server) send no Origin header

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (isDevelopment && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return true;

  return false;
}

export function parseAllowedOrigins(configValue: string | undefined): string[] {
  return (
    configValue
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}
