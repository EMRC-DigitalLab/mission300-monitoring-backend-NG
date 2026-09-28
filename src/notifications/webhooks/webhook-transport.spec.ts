import { EventEmitter } from "node:events";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isBlockedIp, resolvePublicWebhookUrl } from "./ssrf-guard";
import { postWebhook } from "./webhook-transport";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));
jest.mock("node:http", () => ({ request: jest.fn() }));
jest.mock("node:https", () => ({ request: jest.fn() }));
const resolve = jest.mocked(lookup);
const send = jest.mocked(httpsRequest);

describe("Webhook SSRF boundary", () => {
  beforeEach(() => jest.resetAllMocks());
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.1.2.3",
    "127.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.1",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:93.184.216.34",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "2001::1",
    "2001:db8::1",
    "3fff::1",
    "fe80::1%eth0",
    "not-an-ip",
  ])("blocks non-public destination %s", (address) => expect(isBlockedIp(address)).toBe(true));

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "100.128.0.1",
    "172.32.0.1",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
  ])("permits native public address %s", (address) => expect(isBlockedIp(address)).toBe(false));

  it.each([
    "ftp://receiver.example.test",
    "https://user:password@receiver.example.test",
    "https://receiver.example.test/#fragment",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:7f00:1]",
  ])("rejects invalid or private URL %s", async (url) => {
    await expect(resolvePublicWebhookUrl(url)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects mixed public/private DNS answers before opening a connection", async () => {
    resolve.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as never);
    await expect(postWebhook("https://receiver.example.test", "{}", "signature")).rejects.toThrow();
    expect(resolve).toHaveBeenCalledWith("receiver.example.test", { all: true, verbatim: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("checks IPv6 literals without an unnecessary DNS lookup", async () => {
    await expect(resolvePublicWebhookUrl("https://[2606:4700:4700::1111]")).resolves.toMatchObject({
      address: "2606:4700:4700::1111",
      family: 6,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects empty DNS answers", async () => {
    resolve.mockResolvedValue([] as never);
    await expect(resolvePublicWebhookUrl("https://receiver.example.test")).rejects.toThrow();
  });

  it("bounds DNS resolution time", async () => {
    jest.useFakeTimers();
    try {
      resolve.mockImplementation(() => new Promise(() => undefined));
      const result = expect(resolvePublicWebhookUrl("https://receiver.example.test")).rejects.toThrow();
      await jest.advanceTimersByTimeAsync(5000);
      await result;
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([200, 302, 307, 308])(
    "pins the socket to the validated IP and does not follow status %s",
    async (statusCode) => {
      resolve
        .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
        .mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
      const response = {
        statusCode,
        headers: { location: "http://169.254.169.254/metadata" },
        destroy: jest.fn(),
      };
      const client = new EventEmitter() as EventEmitter & { end: jest.Mock };
      client.end = jest.fn(() =>
        setImmediate(() => send.mock.calls[0]![2]!(response as unknown as IncomingMessage)),
      );
      send.mockReturnValue(client as never);
      await expect(postWebhook("https://receiver.example.test:8443/events", "{}", "signature")).resolves.toBe(
        statusCode,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          hostname: "93.184.216.34",
          family: 4,
          servername: "receiver.example.test",
          agent: false,
          headers: expect.objectContaining({ Host: "receiver.example.test:8443" }),
        }),
      );
      expect(httpRequest).not.toHaveBeenCalled();
      expect(response.destroy).toHaveBeenCalled();
    },
  );
});
