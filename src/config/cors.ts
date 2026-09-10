/**
 * Origin allow-list logic for CORS. Beyond exact matches from CORS_ORIGIN,
 * two patterns are always allowed regardless of environment:
 *   - any *.vercel.app origin (preview + prod deployments of the frontend)
 *   - any localhost/127.0.0.1 origin, on any port (local frontend dev)
 *
 * NOTE: this is intentionally permissive for Vercel preview URLs and local
 * dev. Once the frontend has a small, fixed set of real domains, prefer
 * narrowing this rather than relying on the vercel.app/localhost patterns
 * in a real production launch.
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true; // non-browser callers (curl, server-to-server) send no Origin header

  if (allowedOrigins.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
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
