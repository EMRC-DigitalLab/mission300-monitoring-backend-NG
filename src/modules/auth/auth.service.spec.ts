import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "@/prisma/prisma.service";
import type { EmailService } from "@/notifications/email/email.service";
import type { BrandingService } from "@/modules/administration/branding/branding.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

// Models transaction locking/rollback. PostgreSQL races are also tested in E2E.
export function sessionFixture(status = "ACTIVE") {
  let state = {
    user: {
      id: "user-a",
      role: "SYSTEM_ADMINISTRATOR",
      roles: [],
      status,
      tokenVersion: 0,
      institutionId: null,
      passwordHash: "fixture",
    },
    resets: [
      {
        id: "reset-a",
        userId: "user-a",
        tokenVersion: 0,
        purpose: "RESET",
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 60000),
      },
    ],
    refreshes: [
      {
        id: "refresh-a",
        userId: "user-a",
        revokedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 60000),
      },
    ],
  };
  function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "tokenHash") return true;
      if (value && typeof value === "object" && "gt" in value)
        return (row[key] as Date) > (value as { gt: Date }).gt;
      return row[key] === value;
    });
  }
  const updateRows = (
    rows: Array<Record<string, unknown>>,
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => {
    let count = 0;
    for (const row of rows)
      if (matches(row, where)) {
        for (const [key, value] of Object.entries(data))
          row[key] =
            value && typeof value === "object" && "increment" in value
              ? Number(row[key]) + Number(value.increment)
              : value;
        count++;
      }
    return { count };
  };
  const db = {
    user: {
      findUnique: jest.fn(async () => structuredClone(state.user)),
      findUniqueOrThrow: jest.fn(async () => structuredClone(state.user)),
      updateMany: jest.fn(async ({ where, data }) => updateRows([state.user], where, data)),
    },
    passwordResetToken: {
      findUnique: jest.fn(async () => structuredClone(state.resets[0] ?? null)),
      updateMany: jest.fn(async ({ where, data }) => updateRows(state.resets, where, data)),
      create: jest.fn(async ({ data }) => {
        const row = { id: "new-reset", usedAt: null, ...data };
        state.resets.push(row);
        return row;
      }),
    },
    refreshToken: {
      findUnique: jest.fn(async () => structuredClone(state.refreshes[0] ?? null)),
      updateMany: jest.fn(async ({ where, data }) => updateRows(state.refreshes, where, data)),
      create: jest.fn(async ({ data }) => {
        const row = { id: `new-${state.refreshes.length}`, revokedAt: null, ...data };
        state.refreshes.push(row);
        return row;
      }),
    },
    $transaction: undefined as unknown as (work: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
  };
  let tail = Promise.resolve();
  db.$transaction = async (work) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone(state);
    try {
      return await work(db);
    } catch (error) {
      state = snapshot;
      throw error;
    } finally {
      release();
    }
  };
  const config = new ConfigService({
    JWT_SECRET: "audit-only-secret-not-used-by-any-deployment",
    JWT_REFRESH_TTL: "7d",
  });
  const service = new AuthService(
    db as unknown as PrismaService,
    new JwtService({ secret: config.getOrThrow("JWT_SECRET") }),
    {} as EmailService,
    {} as BrandingService,
    config,
  );
  const strategy = new JwtStrategy(config, db as unknown as PrismaService);
  return { db, service, strategy, state: () => state };
}

describe("Recovery and refresh security", () => {
  it("invalidates old JWTs, refresh tokens and all recovery links on reset", async () => {
    const fixture = sessionFixture();
    await fixture.service.setPassword({ token: "fixture", newPassword: "Fixture-new-password-123!" });
    expect(fixture.state().user.tokenVersion).toBe(1);
    await expect(fixture.strategy.validate({ sub: "user-a", tokenVersion: 0 })).rejects.toMatchObject({
      status: 401,
    });
    await expect(fixture.service.refresh("old-cookie")).rejects.toMatchObject({ status: 401 });
    expect(fixture.state().resets.every((row) => row.usedAt !== null)).toBe(true);
  });
  it("does not reactivate a suspended account", async () => {
    const fixture = sessionFixture("SUSPENDED");
    await expect(
      fixture.service.setPassword({ token: "fixture", newPassword: "Fixture-new-password-123!" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fixture.state().user.status).toBe("SUSPENDED");
    expect(fixture.state().user.passwordHash).toBe("fixture");
  });
  it("distinguishes pending invitations from active-account recovery", async () => {
    const fixture = sessionFixture("PENDING");
    await expect(
      fixture.service.setPassword({ token: "fixture", newPassword: "Fixture-new-password-123!" }),
    ).rejects.toMatchObject({ status: 401 });
    fixture.state().resets[0]!.purpose = "INVITE";
    await fixture.service.setPassword({ token: "fixture", newPassword: "Fixture-new-password-123!" });
    expect(fixture.state().user.status).toBe("ACTIVE");
  });
  it("allows exactly one refresh when the same cookie is used concurrently", async () => {
    const fixture = sessionFixture();
    const results = await Promise.allSettled([
      fixture.service.refresh("cookie"),
      fixture.service.refresh("cookie"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(fixture.db.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(fixture.state().refreshes.filter((row) => row.revokedAt === null)).toHaveLength(1);
  });
  it("allows exactly one concurrent recovery and rejects an old session version", async () => {
    const fixture = sessionFixture();
    const input = { token: "fixture", newPassword: "Fixture-new-password-123!" };
    const results = await Promise.allSettled([
      fixture.service.setPassword(input),
      fixture.service.setPassword(input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    fixture.state().resets[0]!.usedAt = null;
    await expect(fixture.service.setPassword(input)).rejects.toMatchObject({ status: 401 });
  });
  it("rolls back password changes if token consumption fails", async () => {
    const fixture = sessionFixture();
    fixture.db.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      fixture.service.setPassword({ token: "fixture", newPassword: "Fixture-new-password-123!" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fixture.state().user.passwordHash).toBe("fixture");
    expect(fixture.state().user.tokenVersion).toBe(0);
  });
});
