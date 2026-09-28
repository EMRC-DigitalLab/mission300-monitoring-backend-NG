import type { INestApplication } from "@nestjs/common";
import { AuthService } from "@/modules/auth/auth.service";
import { UsersService } from "@/modules/administration/users/users.service";
import { PrismaService } from "@/prisma/prisma.service";
import { createTestApp, createThrowawayUser, request } from "./helpers/e2e";

describe("Session security with PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  const createdUsers: string[] = [];
  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });
  afterEach(async () => {
    for (const userId of createdUsers.splice(0)) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });
  afterAll(async () => app?.close());
  async function fixture() {
    const user = await createThrowawayUser(prisma, { role: "READ_ONLY_USER" });
    createdUsers.push(user.id);
    return user;
  }

  it("password reset rejects existing access tokens and refresh cookies", async () => {
    const user = await fixture();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);
    const token = await auth.createPasswordResetToken(user.id, 60000);
    await request(app.getHttpServer())
      .post("/auth/set-password")
      .send({ token, newPassword: "Integration-new-password-123!" })
      .expect(200);
    await request(app.getHttpServer())
      .get("/filters")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(401);
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    await request(app.getHttpServer()).post("/auth/refresh").set("Cookie", cookie).expect(401);
  });

  it("one refresh cookie produces exactly one successor under parallel requests", async () => {
    const user = await fixture();
    const { refreshToken } = await auth.login({ email: user.email, password: user.password });
    const results = await Promise.allSettled([auth.refresh(refreshToken), auth.refresh(refreshToken)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });

  it("one reset link produces exactly one successful password change under parallel requests", async () => {
    const user = await fixture();
    const token = await auth.createPasswordResetToken(user.id, 60000);
    const input = { token, newPassword: "Integration-new-password-123!" };
    const results = await Promise.allSettled([auth.setPassword(input), auth.setPassword(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("a reset link cannot reverse suspension, even after the account is re-enabled", async () => {
    const user = await fixture();
    const token = await auth.createPasswordResetToken(user.id, 60000);
    const users = app.get(UsersService);
    await users.setStatus(user.id, "SUSPENDED");
    await expect(
      auth.setPassword({ token, newPassword: "Integration-new-password-123!" }),
    ).rejects.toMatchObject({ status: 401 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("SUSPENDED");
    await users.setStatus(user.id, "ACTIVE");
    await expect(
      auth.setPassword({ token, newPassword: "Integration-new-password-123!" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
