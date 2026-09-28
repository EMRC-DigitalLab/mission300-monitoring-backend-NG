import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { resolvePublicWebhookUrl } from "./ssrf-guard";

/** Connect directly to the validated address. The domain remains the Host
 * header and TLS server name, so certificate checks and virtual hosts work.
 * Native HTTP requests do not follow redirects; no second DNS lookup occurs.
 */
export async function postWebhook(rawUrl: string, body: string, signature: string): Promise<number> {
  const { url, address, family } = await resolvePublicWebhookUrl(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      url,
      {
        method: "POST",
        hostname: address,
        family,
        servername: isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: true,
        agent: false,
        signal: AbortSignal.timeout(10000),
        headers: {
          Host: url.host,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-M300-Signature": `sha256=${signature}`,
        },
      },
      (response) => {
        // Only the status is needed. Stop reading to bound response memory.
        const status = response.statusCode ?? 0;
        response.destroy();
        resolve(status);
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}
