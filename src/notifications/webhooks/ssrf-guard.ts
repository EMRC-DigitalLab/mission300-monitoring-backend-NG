import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
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
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  return false;
}

function unwrapIpv4MappedIpv6(ip: string): string | null {
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return match ? match[1] : null;
}

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  const mapped = unwrapIpv4MappedIpv6(ip);
  if (mapped) return isBlockedIpv4(mapped);
  return isBlockedIpv6(ip);
}

export class WebhookUrlBlockedError extends Error {
  constructor(url: string) {
    super(`Webhook URL "${url}" resolves to a blocked private/internal address`);
    this.name = "WebhookUrlBlockedError";
  }
}

export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new WebhookUrlBlockedError(rawUrl);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebhookUrlBlockedError(rawUrl);
  }

  const { address } = await lookup(parsed.hostname);
  if (isBlockedIp(address)) {
    throw new WebhookUrlBlockedError(rawUrl);
  }
}
