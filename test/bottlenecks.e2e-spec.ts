import { INestApplication } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { createTestApp, request, loginAs, bearer, ADMIN_CREDENTIALS } from "./helpers/e2e";

describe("Bottlenecks (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let realProjectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ({ token } = await loginAs(app, ADMIN_CREDENTIALS));

    const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
    if (!project) throw new Error("No project exists in the database to test against.");
    realProjectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /bottlenecks/filters", () => {
    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).get("/bottlenecks/filters");
      expect(res.status).toBe(401);
    });

    it("returns filter options", async () => {
      const res = await request(app.getHttpServer()).get("/bottlenecks/filters").set(...bearer(token));
      expect(res.status).toBe(200);
    });
  });

  describe("GET /bottlenecks", () => {
    it("returns the register overview", async () => {
      const res = await request(app.getHttpServer()).get("/bottlenecks").set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("accepts all documented query params together", async () => {
      const res = await request(app.getHttpServer())
        .get("/bottlenecks")
        .query({
          search: "financing",
          severity: "high",
          category: "financing",
          institution: "Sample DisCo",
          pillar: "generation-network",
          linkedRecord: realProjectId,
          lifecycleStage: "design",
          escalationStatus: "not-escalated",
          validationStatus: "confirmed",
          reportingPeriod: "2025-Q4",
          page: 1,
          pageSize: 10,
          escalationPage: 1,
        })
        .set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("rejects an unknown query param", async () => {
      const res = await request(app.getHttpServer())
        .get("/bottlenecks")
        .query({ bogus: "x" })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });

    it("rejects a pageSize above 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/bottlenecks")
        .query({ pageSize: 999 })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /bottlenecks/by-project/:projectId", () => {
    it("returns bottlenecks scoped to a real project", async () => {
      const res = await request(app.getHttpServer())
        .get(`/bottlenecks/by-project/${realProjectId}`)
        .set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("returns 404 for a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .get("/bottlenecks/by-project/does-not-exist-project")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /bottlenecks", () => {
    it("creates a bottleneck with a valid payload and no auth-role restriction", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "E2E test procurement delay",
          category: "procurement",
          severity: "medium",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
          followUp: "Escalate to steering committee",
        });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.record.issue).toBe("E2E test procurement delay");

      await prisma.bottleneck.delete({ where: { id: res.body.record.id } }).catch(() => undefined);
    });

    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).post("/bottlenecks").send({
        issue: "Unauthed issue",
        category: "procurement",
        severity: "medium",
        pillar: "generation-network",
        institution: "Sample DisCo",
        lifecycleStage: "procurement",
      });
      expect(res.status).toBe(401);
    });

    it("rejects an issue description shorter than 5 characters", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Bad",
          category: "procurement",
          severity: "medium",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid category", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Some real issue here",
          category: "not-a-real-category",
          severity: "medium",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid severity", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Some real issue here",
          category: "procurement",
          severity: "not-a-real-severity",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid pillar", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Some real issue here",
          category: "procurement",
          severity: "medium",
          pillar: "not-a-real-pillar",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
        });
      expect(res.status).toBe(400);
    });

    it("rejects a missing institution", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Some real issue here",
          category: "procurement",
          severity: "medium",
          pillar: "generation-network",
          lifecycleStage: "procurement",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid lifecycleStage", async () => {
      const res = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "Some real issue here",
          category: "procurement",
          severity: "medium",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "not-a-real-stage",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /bottlenecks/:id (status)", () => {
    async function createThrowawayBottleneck() {
      const createRes = await request(app.getHttpServer())
        .post("/bottlenecks")
        .set(...bearer(token))
        .send({
          issue: "E2E throwaway bottleneck for status updates",
          category: "procurement",
          severity: "medium",
          pillar: "generation-network",
          institution: "Sample DisCo",
          lifecycleStage: "procurement",
        });
      return createRes.body.record.id as string;
    }

    it("updates the status of a throwaway bottleneck", async () => {
      const id = await createThrowawayBottleneck();
      try {
        const res = await request(app.getHttpServer())
          .patch(`/bottlenecks/${id}`)
          .set(...bearer(token))
          .send({ status: "in-progress", followUp: "Vendor selected" });
        expect(res.status).toBe(200);
        expect(res.body.record.status).toBeTruthy();
      } finally {
        await prisma.bottleneck.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it("rejects an invalid status value", async () => {
      const id = await createThrowawayBottleneck();
      try {
        const res = await request(app.getHttpServer())
          .patch(`/bottlenecks/${id}`)
          .set(...bearer(token))
          .send({ status: "not-a-real-status" });
        expect(res.status).toBe(400);
      } finally {
        await prisma.bottleneck.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it("returns 404 for a nonexistent bottleneck", async () => {
      const res = await request(app.getHttpServer())
        .patch("/bottlenecks/does-not-exist")
        .set(...bearer(token))
        .send({ status: "resolved" });
      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const id = await createThrowawayBottleneck();
      try {
        const res = await request(app.getHttpServer()).patch(`/bottlenecks/${id}`).send({ status: "resolved" });
        expect(res.status).toBe(401);
      } finally {
        await prisma.bottleneck.delete({ where: { id } }).catch(() => undefined);
      }
    });
  });
});
