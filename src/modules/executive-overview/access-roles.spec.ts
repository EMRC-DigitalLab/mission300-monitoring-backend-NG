import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { JwtStrategy } from "@/modules/auth/jwt.strategy";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { PrismaService } from "@/prisma/prisma.service";
import { ExecutiveOverviewController } from "@/modules/executive-overview/executive-overview.controller";
import { ExecutiveOverviewService } from "@/modules/executive-overview/executive-overview.service";
import { InstitutionsController } from "@/modules/institutions/institutions.controller";
import { InstitutionsService } from "@/modules/institutions/institutions.service";

const SECRET = "audit-only-secret-not-used-by-any-deployment";

const account = (role: string) => ({
  id: role,
  role,
  roles: [],
  status: "ACTIVE",
  institutionId: role === "INSTITUTIONAL_DATA_PROVIDER" ? "inst-a" : null,
  tokenVersion: 0,
});

describe("Role restrictions on the executive overview and the institutions list (isolated app)", () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: SECRET });
  const token = (role: string) => jwt.sign({ sub: role, tokenVersion: 0 });

  const overview = { getOverview: jest.fn().mockResolvedValue({ ok: true }) };
  const institutions = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    getMyOverview: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: "default", ttl: 60000, limit: 500 }])],
      controllers: [ExecutiveOverviewController, InstitutionsController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: SECRET }) },
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn(async ({ where }) => account(where.id)) } } },
        { provide: ExecutiveOverviewService, useValue: overview },
        { provide: InstitutionsService, useValue: institutions },
        JwtStrategy,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const get = (path: string, role: string) =>
    request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token(role)}`);

  it("keeps an institutional data provider out of the executive overview", async () => {
    await get("/executive-overview", "INSTITUTIONAL_DATA_PROVIDER").expect(403);
    expect(overview.getOverview).not.toHaveBeenCalled();
  });

  it.each(["SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER", "OVERSIGHT_USER", "READ_ONLY_USER"])(
    "lets %s open the executive overview",
    async (role) => {
      await get("/executive-overview", role).expect(200);
    },
  );

  it.each(["DATA_REVIEWER", "VALIDATOR"])("keeps %s out of the executive overview", async (role) => {
    await get("/executive-overview", role).expect(403);
  });

  it("keeps an institutional data provider away from the institutions list and any single institution", async () => {
    await get("/institutions", "INSTITUTIONAL_DATA_PROVIDER").expect(403);
    await get("/institutions/inst-b", "INSTITUTIONAL_DATA_PROVIDER").expect(403);
    expect(institutions.findAll).not.toHaveBeenCalled();
    expect(institutions.findOne).not.toHaveBeenCalled();
  });

  it.each(["DASHBOARD_MANAGER", "READ_ONLY_USER", "OVERSIGHT_USER"])("keeps %s out of the institutions list", async (role) => {
    await get("/institutions", role).expect(403);
  });

  it("lets an administrator read the institutions list", async () => {
    await get("/institutions", "SYSTEM_ADMINISTRATOR").expect(200);
    expect(institutions.findAll).toHaveBeenCalledTimes(1);
  });

  it("still lets a provider read their own institution overview", async () => {
    await get("/institutions/me/overview", "INSTITUTIONAL_DATA_PROVIDER").expect(200);
    expect(institutions.getMyOverview).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthenticated request", async () => {
    await request(app.getHttpServer()).get("/executive-overview").expect(401);
  });
});
