import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  // Only native global unicast destinations are eligible. This also blocks
  // mapped/compatible IPv4, NAT64, scoped, multicast and unspecified forms.
  if (ip.includes("%")) return true;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [head, tail] = normalized.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const parts =
    tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const value = BigInt(`0x${parts.map((part) => part.padStart(4, "0")).join("")}`);
  const prefix = (base: string, bits: number) =>
    value >> BigInt(128 - bits) === BigInt(base) >> BigInt(128 - bits);
  return (
    !prefix("0x20000000000000000000000000000000", 3) ||
    prefix("0x20010000000000000000000000000000", 23) ||
    prefix("0x20010db8000000000000000000000000", 32) ||
    prefix("0x20020000000000000000000000000000", 16) ||
    prefix("0x3fff0000000000000000000000000000", 20)
  );
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}

export class WebhookUrlBlockedError extends Error {
  constructor() {
    // Do not copy a user-supplied URL (which may contain credentials) to logs.
    super("Webhook destination must be a public HTTP(S) endpoint without credentials");
    this.name = "WebhookUrlBlockedError";
  }
}

export async function resolvePublicWebhookUrl(
  rawUrl: string,
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new WebhookUrlBlockedError();
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new WebhookUrlBlockedError();
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = family
    ? [{ address: hostname, family }]
    : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new WebhookUrlBlockedError()), 5000);
        }),
      ]).finally(() => clearTimeout(timeout));
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address)))
    throw new WebhookUrlBlockedError();
  return { url: parsed, address: addresses[0]!.address, family: addresses[0]!.family as 4 | 6 };
}

export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  await resolvePublicWebhookUrl(rawUrl);
}
