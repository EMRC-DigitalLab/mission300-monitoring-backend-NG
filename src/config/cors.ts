/**
 * Origin allow-list logic for CORS. Beyond exact matches from CORS_ORIGIN:
 *   - any *.vercel.app origin is always allowed (preview + prod deployments
 *     of the frontend) - Vercel's preview subdomain is unpredictable per
 *     branch/PR, so there's no fixed value CORS_ORIGIN could list instead.
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

  if (allowedOrigins.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (isDevelopment && (hostname === "localhost" || hostname === "127.0.0.1")) return true;
  if (hostname.endsWith(".vercel.app")) return true;

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
