import { Test, type TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import request from "supertest";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/prisma/prisma.service";

const noopThrottlerStorage: ThrottlerStorage = {
  async increment() {
    return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
  },
};

export const SEED_INSTITUTION_ID = "seed-institution";
export const OTHER_INSTITUTION_ID = "seed-disco-ikeja-electric";

export const ADMIN_CREDENTIALS = { email: "admin@m300.local", password: "ChangeMe123!" };
export const PROVIDER_CREDENTIALS = { email: "provider@m300.local", password: "ChangeMe123!" };
export const REVIEWER_CREDENTIALS = { email: "reviewer@m300.local", password: "ChangeMe123!" };

export async function createTestApp(opts: { realThrottle?: boolean } = {}): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (!opts.realThrottle) {
    builder.overrideProvider(ThrottlerStorage).useValue(noopThrottlerStorage);
  }
  const moduleRef: TestingModule = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

export async function loginAs(
  app: INestApplication,
  credentials: { email: string; password: string },
): Promise<{ token: string; user: any }> {
  const res = await request(app.getHttpServer()).post("/auth/login").send(credentials);
  if (res.status !== 200) {
    throw new Error(`login failed for ${credentials.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.accessToken, user: res.body.user };
}

export function bearer(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}

/**
 * Creates a throwaway user directly via Prisma (bypassing the invite-email
 * flow) with a known password, for RBAC tests that need a role not present
 * in the seed data. Returns credentials plus a cleanup function.
 */
export async function createThrowawayUser(
  prisma: PrismaService,
  opts: { role: string; roles?: string[]; institutionId?: string | null },
): Promise<{ id: string; email: string; password: string }> {
  const email = `e2e-${randomUUID()}@m300.local`;
  const password = "ChangeMe123!";
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      email,
      fullName: "E2E Throwaway User",
      designation: "E2E Test",
      role: opts.role as any,
      roles: (opts.roles ?? [opts.role]) as any,
      institutionId: opts.institutionId ?? null,
      passwordHash,
      status: "ACTIVE",
    },
  });
  return { id: user.id, email: user.email, password };
}

export async function deleteUser(prisma: PrismaService, userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

export async function deleteUserByEmail(prisma: PrismaService, email: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${randomUUID()}@m300.local`;
}

export { request };
