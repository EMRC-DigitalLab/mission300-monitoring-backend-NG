import "reflect-metadata";
import { Writable } from "node:stream";
import { Controller, Get, Logger, Res, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import request from "supertest";
import type { Response } from "express";
import { lastValueFrom, of } from "rxjs";
import { httpLoggerOptions, redactSecurityData } from "./logging";
import { EmailService } from "@/notifications/email/email.service";
import { AuditLogInterceptor } from "@/common/interceptors/audit-log.interceptor";
import type { ExecutionContext } from "@nestjs/common";
import type { PrismaService } from "@/prisma/prisma.service";

@Controller("log-fixture")
class FixtureController {
  @Get() get(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Set-Cookie", "refreshToken=fake-response-cookie; HttpOnly");
    return { ok: true };
  }
}

describe("Credential-safe HTTP and audit logging", () => {
  let app: INestApplication,
    captured = "";
  beforeAll(async () => {
    const stream = new Writable({
      write(chunk, _encoding, next) {
        captured += chunk.toString();
        next();
      },
    });
    const module = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [httpLoggerOptions("production"), stream] })],
      controllers: [FixtureController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app?.close());
  it("omits access tokens, incoming cookies, query credentials and outgoing Set-Cookie", async () => {
    await request(app.getHttpServer())
      .get("/log-fixture?token=fake-query-token&apiKey=fake-query-key")
      .set("Authorization", "Bearer fake-access-token")
      .set("Cookie", "refreshToken=fake-refresh-cookie")
      .set("X-Api-Key", "fake-api-key")
      .expect(200);
    await new Promise((resolve) => setImmediate(resolve));
    for (const credential of [
      "fake-access-token",
      "fake-refresh-cookie",
      "fake-query-token",
      "fake-query-key",
      "fake-api-key",
      "fake-response-cookie",
    ])
      expect(captured).not.toContain(credential);
    expect(captured).toContain("/log-fixture");
    expect(captured).toContain('"statusCode":200');
  });
  it("redacts nested arrays and objects while preserving useful record metadata", () => {
    expect(
      redactSecurityData({
        id: "record",
        secret: "secret",
        nested: [{ user: { passwordHash: "hash", refresh_token: "token", name: "User" } }],
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toEqual({ id: "record", nested: [{ user: { name: "User" } }], createdAt: "2026-01-01T00:00:00.000Z" });
  });
  it("returns the one-time webhook secret to the caller but excludes it from the audit database", async () => {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new AuditLogInterceptor(
      { get: () => "webhook.created" } as unknown as Reflector,
      { auditLogEntry: { create } } as unknown as PrismaService,
    );
    const context = {
      getHandler: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { id: "admin" } }) }),
    } as unknown as ExecutionContext;
    const result = {
      id: "subscription",
      secret: "one-time-secret",
      nested: [{ tokenHash: "hash", accessToken: "token" }],
    };
    expect(await lastValueFrom(interceptor.intercept(context, { handle: () => of(result) }))).toBe(result);
    expect(JSON.stringify(create.mock.calls)).not.toContain("one-time-secret");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: "subscription",
          after: { id: "subscription", nested: [{}] },
        }),
      }),
    );
  });
  it("never logs invitation or recovery links when email delivery is disabled", async () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      const service = new EmailService(new ConfigService({}));
      await service.send({
        to: "fixture@example.test",
        subject: "Recovery",
        html: '<a href="https://frontend.example.test/reset?token=fake-recovery-secret">Reset</a>',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("fake-recovery-secret");
      expect(log).toHaveBeenCalledWith("Email skipped: delivery provider is not configured");
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
