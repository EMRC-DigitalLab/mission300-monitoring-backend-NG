import type { Options } from "pino-http";

/** Log useful request metadata without credential-bearing headers, bodies,
 * query values or response cookies. These rules apply in every environment.
 */
export function httpLoggerOptions(environment = process.env.NODE_ENV): Options {
  return {
    level: environment === "development" ? "debug" : "info",
    transport: environment === "development" ? { target: "pino-pretty" } : undefined,
    serializers: {
      req: (request) => ({ id: request.id, method: request.method, url: request.url?.split(/[?#]/)[0] }),
      res: (response) => ({ statusCode: response.statusCode }),
      err: (error) => ({ type: error.type ?? error.name, code: error.code, statusCode: error.statusCode }),
    },
    // Defence against future serializers accidentally reintroducing data.
    redact: {
      paths: [
        "req.headers",
        "req.body",
        "req.query",
        "req.params",
        "res.headers",
        "password",
        "passwordHash",
        "token",
        "tokenHash",
        "accessToken",
        "refreshToken",
        "secret",
        "authorization",
        "cookie",
        "apiKey",
      ],
      remove: true,
    },
  };
}

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "passwordhash",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "authorization",
  "cookie",
  "setcookie",
  "reseturl",
  "setpasswordurl",
  "apikey",
  "signingsecret",
  "databaseurl",
  "connectionstring",
]);

function auditLink(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split(/[?#]/)[0]!;
  }
}

/** Audit payloads may contain arbitrarily nested objects and arrays. */
export function redactSecurityData(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactSecurityData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.replace(/[-_]/g, "").toLowerCase()))
      .map(([key, nested]) => [
        key,
        typeof nested === "string" && /(?:url|uri|link)$/i.test(key)
          ? auditLink(nested)
          : redactSecurityData(nested),
      ]),
  );
}
