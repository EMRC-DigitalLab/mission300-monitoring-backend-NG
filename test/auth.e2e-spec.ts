import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "@/prisma/prisma.service";
import { AuthService } from "@/modules/auth/auth.service";
import {
  createTestApp,
  request,
  ADMIN_CREDENTIALS,
  PROVIDER_CREDENTIALS,
  REVIEWER_CREDENTIALS,
  uniqueEmail,
} from "./helpers/e2e";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/identify", () => {
    it("returns 200 for a known active account", async () => {
      const res = await request(app.getHttpServer()).post("/auth/identify").send({ email: ADMIN_CREDENTIALS.email });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: ADMIN_CREDENTIALS.email });
    });

    it("returns 200 for a completely unknown email (WEB-006: no enumeration oracle)", async () => {
      const unknown = uniqueEmail("does-not-exist");
      const res = await request(app.getHttpServer()).post("/auth/identify").send({ email: unknown });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: unknown });
    });

    it("returns byte-identical response shape for known vs unknown email", async () => {
      const known = await request(app.getHttpServer()).post("/auth/identify").send({ email: ADMIN_CREDENTIALS.email });
      const unknown = await request(app.getHttpServer())
        .post("/auth/identify")
        .send({ email: uniqueEmail("nobody") });
      expect(known.status).toBe(unknown.status);
      expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
      expect(known.body).not.toHaveProperty("displayName");
      expect(known.body).not.toHaveProperty("institution");
      expect(known.body).not.toHaveProperty("status");
      expect(known.body).not.toHaveProperty("exists");
    });

    it("rejects a malformed email with 400", async () => {
      const res = await request(app.getHttpServer()).post("/auth/identify").send({ email: "not-an-email" });
      expect(res.status).toBe(400);
    });

    it("rejects a missing email with 400", async () => {
      const res = await request(app.getHttpServer()).post("/auth/identify").send({});
      expect(res.status).toBe(400);
    });

    it("rejects unknown extra fields (whitelist/forbidNonWhitelisted)", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/identify")
        .send({ email: ADMIN_CREDENTIALS.email, extra: "field" });
      expect(res.status).toBe(400);
    });

    it("does not require an Authorization header", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/identify")
        .set("Authorization", "")
        .send({ email: ADMIN_CREDENTIALS.email });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /auth/login", () => {
    it("logs in a valid admin account and returns an access token", async () => {
      const res = await request(app.getHttpServer()).post("/auth/login").send(ADMIN_CREDENTIALS);
      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe("string");
      expect(res.body.accessToken.length).toBeGreaterThan(10);
      expect(res.body.user).toMatchObject({
        email: ADMIN_CREDENTIALS.email,
        role: "SYSTEM_ADMINISTRATOR",
      });
      expect(Array.isArray(res.body.user.roles)).toBe(true);
    });

    it("logs in a valid provider account with institution scoping in the response", async () => {
      const res = await request(app.getHttpServer()).post("/auth/login").send(PROVIDER_CREDENTIALS);
      expect(res.status).toBe(200);
      expect(res.body.user.institutionId).toBe("seed-institution");
      expect(res.body.user.role).toBe("INSTITUTIONAL_DATA_PROVIDER");
    });

    it("logs in a valid reviewer account", async () => {
      const res = await request(app.getHttpServer()).post("/auth/login").send(REVIEWER_CREDENTIALS);
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("DATA_REVIEWER");
    });

    it("rejects a wrong password with 401 and a generic message", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: ADMIN_CREDENTIALS.email, password: "WrongPassword123!" });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it("rejects a nonexistent email with the same generic 401 message as a wrong password", async () => {
      const res1 = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: uniqueEmail("ghost"), password: "SomePassword123!" });
      const res2 = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: ADMIN_CREDENTIALS.email, password: "WrongPassword123!" });
      expect(res1.status).toBe(401);
      expect(res2.status).toBe(401);
      expect(res1.body.message).toBe(res2.body.message);
    });

    it("rejects a PENDING account (not yet activated) with 401", async () => {
      const email = uniqueEmail("pending-user");
      const passwordHash = await argon2.hash("SomePassword123!");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Pending Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
        },
      });
      try {
        const res = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "SomePassword123!" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects an INACTIVE account with 401", async () => {
      const email = uniqueEmail("inactive-user");
      const passwordHash = await argon2.hash("SomePassword123!");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Inactive Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "INACTIVE",
        },
      });
      try {
        const res = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "SomePassword123!" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects a SUSPENDED account with 401", async () => {
      const email = uniqueEmail("suspended-user");
      const passwordHash = await argon2.hash("SomePassword123!");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Suspended Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "SUSPENDED",
        },
      });
      try {
        const res = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "SomePassword123!" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects a missing password with 400", async () => {
      const res = await request(app.getHttpServer()).post("/auth/login").send({ email: ADMIN_CREDENTIALS.email });
      expect(res.status).toBe(400);
    });

    it("rejects a password shorter than 8 characters with 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: ADMIN_CREDENTIALS.email, password: "short" });
      expect(res.status).toBe(400);
    });

    it("rejects a malformed email with 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "not-an-email", password: "ChangeMe123!" });
      expect(res.status).toBe(400);
    });

    it("rejects a non-string password (type coercion attempt) with 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: ADMIN_CREDENTIALS.email, password: 12345678 });
      expect(res.status).toBe(400);
    });

    it("rejects unknown extra fields with 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ ...ADMIN_CREDENTIALS, isAdmin: true });
      expect(res.status).toBe(400);
    });

    it("does not leak a stack trace or internal error details on failure", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: ADMIN_CREDENTIALS.email, password: "WrongPassword123!" });
      expect(res.body).not.toHaveProperty("stack");
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("returns 200 with a generic message for a known account", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: ADMIN_CREDENTIALS.email });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if that account exists/i);
    });

    it("returns the identical 200 response for an unknown account (enumeration protection)", async () => {
      const known = await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: ADMIN_CREDENTIALS.email });
      const unknown = await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: uniqueEmail("nobody-fp") });
      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
    });

    it("rejects a malformed email with 400", async () => {
      const res = await request(app.getHttpServer()).post("/auth/forgot-password").send({ email: "bad" });
      expect(res.status).toBe(400);
    });

    it("invalidates a previously issued unused reset token when requested again", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_CREDENTIALS.email } });
      try {
        const firstToken = await app.get(AuthService).createPasswordResetToken(user.id, 60 * 60 * 1000);
        await app.get(AuthService).createPasswordResetToken(user.id, 60 * 60 * 1000);
        const res = await request(app.getHttpServer())
          .post("/auth/set-password")
          .send({ token: firstToken, newPassword: "ShouldNotWork123!" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      }
    });
  });

  describe("POST /auth/set-password", () => {
    it("sets a password with a valid token and the account becomes usable", async () => {
      const email = uniqueEmail("set-password");
      const passwordHash = await argon2.hash(Buffer.from(Math.random().toString()).toString("hex"));
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Set Password Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "PENDING",
        },
      });
      try {
        const authService = app.get(AuthService);
        const token = await authService.createPasswordResetToken(user.id, 60 * 60 * 1000);

        const setRes = await request(app.getHttpServer())
          .post("/auth/set-password")
          .send({ token, newPassword: "BrandNewPassword123!" });
        expect(setRes.status).toBe(200);

        const loginRes = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "BrandNewPassword123!" });
        expect(loginRes.status).toBe(200);
      } finally {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects reusing an already-redeemed token with 401", async () => {
      const email = uniqueEmail("reuse-token");
      const passwordHash = await argon2.hash("temp");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Reuse Token Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "PENDING",
        },
      });
      try {
        const authService = app.get(AuthService);
        const token = await authService.createPasswordResetToken(user.id, 60 * 60 * 1000);
        const first = await request(app.getHttpServer())
          .post("/auth/set-password")
          .send({ token, newPassword: "FirstPassword123!" });
        expect(first.status).toBe(200);

        const second = await request(app.getHttpServer())
          .post("/auth/set-password")
          .send({ token, newPassword: "SecondPassword123!" });
        expect(second.status).toBe(401);
      } finally {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects a garbage/unknown token with 401", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/set-password")
        .send({ token: "totally-not-a-real-token", newPassword: "SomePassword123!" });
      expect(res.status).toBe(401);
    });

    it("rejects an expired token with 401", async () => {
      const email = uniqueEmail("expired-token");
      const passwordHash = await argon2.hash("temp");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Expired Token Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "PENDING",
        },
      });
      try {
        const authService = app.get(AuthService);
        const token = await authService.createPasswordResetToken(user.id, -1000);
        const res = await request(app.getHttpServer())
          .post("/auth/set-password")
          .send({ token, newPassword: "SomePassword123!" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("rejects a new password shorter than 8 characters with 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/set-password")
        .send({ token: "whatever", newPassword: "short" });
      expect(res.status).toBe(400);
    });

    it("rejects a missing token with 400", async () => {
      const res = await request(app.getHttpServer()).post("/auth/set-password").send({ newPassword: "SomePassword123!" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /auth/logout (WEB-008)", () => {
    it("requires authentication (401 with no token)", async () => {
      const res = await request(app.getHttpServer()).post("/auth/logout");
      expect(res.status).toBe(401);
    });

    it("revokes the caller's token so it can no longer be used", async () => {
      const email = uniqueEmail("logout-test");
      const passwordHash = await argon2.hash("LogoutPassword123!");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Logout Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "ACTIVE",
        },
      });
      try {
        const loginRes = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "LogoutPassword123!" });
        expect(loginRes.status).toBe(200);
        const token = loginRes.body.accessToken;

        const before = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${token}`);
        expect(before.status).toBe(200);

        const logoutRes = await request(app.getHttpServer())
          .post("/auth/logout")
          .set("Authorization", `Bearer ${token}`);
        expect(logoutRes.status).toBe(200);

        const after = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${token}`);
        expect(after.status).toBe(401);
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it("does not invalidate a freshly issued token for the same account after logout", async () => {
      const email = uniqueEmail("logout-relogin");
      const passwordHash = await argon2.hash("ReloginPassword123!");
      const user = await prisma.user.create({
        data: {
          email,
          fullName: "Relogin Tester",
          designation: "Tester",
          role: "READ_ONLY_USER",
          roles: ["READ_ONLY_USER"],
          passwordHash,
          status: "ACTIVE",
        },
      });
      try {
        const firstLogin = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "ReloginPassword123!" });
        const firstToken = firstLogin.body.accessToken;

        await request(app.getHttpServer()).post("/auth/logout").set("Authorization", `Bearer ${firstToken}`);

        const secondLogin = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: "ReloginPassword123!" });
        expect(secondLogin.status).toBe(200);
        const secondToken = secondLogin.body.accessToken;

        const res = await request(app.getHttpServer())
          .get("/users/me")
          .set("Authorization", `Bearer ${secondToken}`);
        expect(res.status).toBe(200);
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });
  });

  describe("Bearer token / guard edge cases", () => {
    it("rejects a request with a malformed Authorization header", async () => {
      const res = await request(app.getHttpServer()).get("/users/me").set("Authorization", "NotBearer sometoken");
      expect(res.status).toBe(401);
    });

    it("rejects a request with an empty bearer token", async () => {
      const res = await request(app.getHttpServer()).get("/users/me").set("Authorization", "Bearer ");
      expect(res.status).toBe(401);
    });

    it("rejects a request with a garbage JWT", async () => {
      const res = await request(app.getHttpServer()).get("/users/me").set("Authorization", "Bearer not.a.jwt");
      expect(res.status).toBe(401);
    });

    it("rejects a token for a user that no longer exists", async () => {
      const jwt = app.get(JwtService);
      const fakeToken = await jwt.signAsync({ sub: "nonexistent-user-id", tokenVersion: 0 });
      const res = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${fakeToken}`);
      expect(res.status).toBe(401);
    });

    it("rejects a token with a stale tokenVersion", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_CREDENTIALS.email } });
      const jwt = app.get(JwtService);
      const staleToken = await jwt.signAsync({ sub: user.id, tokenVersion: user.tokenVersion + 999 });
      const res = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${staleToken}`);
      expect(res.status).toBe(401);
    });

    it("allows GET /health without any auth", async () => {
      const res = await request(app.getHttpServer()).get("/health");
      expect(res.status).toBe(200);
    });
  });

  describe("Rate limiting on auth endpoints (WEB-007)", () => {
    let throttledApp: INestApplication;

    beforeAll(async () => {
      throttledApp = await createTestApp({ realThrottle: true });
    });

    afterAll(async () => {
      await throttledApp.close();
    });

    it("returns 429 after exceeding the identify rate limit within the window", async () => {
      const server = throttledApp.getHttpServer();
      let sawTooManyRequests = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(server).post("/auth/identify").send({ email: uniqueEmail(`throttle-${i}`) });
        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }
      expect(sawTooManyRequests).toBe(true);
    }, 30000);

    it("returns 429 after exceeding the login rate limit within the window", async () => {
      const server = throttledApp.getHttpServer();
      let sawTooManyRequests = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(server)
          .post("/auth/login")
          .send({ email: uniqueEmail(`throttle-login-${i}`), password: "WrongPassword123!" });
        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }
      expect(sawTooManyRequests).toBe(true);
    }, 30000);
  });
});
