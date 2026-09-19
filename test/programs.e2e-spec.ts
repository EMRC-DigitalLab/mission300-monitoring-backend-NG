import { INestApplication } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { createTestApp, request, loginAs, bearer, ADMIN_CREDENTIALS } from "./helpers/e2e";

describe("Programs (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let realProgrammeId: string;
  let realProjectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ({ token } = await loginAs(app, ADMIN_CREDENTIALS));

    const programme = await prisma.programme.findFirst({ orderBy: { createdAt: "asc" } });
    if (!programme) throw new Error("No programme exists in the database to test against.");
    realProgrammeId = programme.id;

    const project = await prisma.project.findFirst({
      where: { programmeId: realProgrammeId },
      orderBy: { createdAt: "asc" },
    });
    if (!project) throw new Error("No project exists under the test programme.");
    realProjectId = project.id;

    // Defensive cleanup: a previous interrupted run of this suite (before
    // the response-shape fix below) could have left one of these behind.
    await prisma.programme.deleteMany({ where: { name: { startsWith: "E2E " } } });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /programs/filters", () => {
    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).get("/programs/filters");
      expect(res.status).toBe(401);
    });

    it("returns filter options for an authenticated caller", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs/filters")
        .set(...bearer(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.pillars)).toBe(true);
      expect(Array.isArray(res.body.institutions)).toBe(true);
      expect(Array.isArray(res.body.statuses)).toBe(true);
    });
  });

  describe("GET /programs", () => {
    it("returns a paginated overview", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs")
        .set(...bearer(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.programmes.items)).toBe(true);
      expect(res.body.headlineCards).toEqual(
        expect.objectContaining({
          summary: expect.any(Object),
          milestoneOnTime: expect.any(Object),
          delayedOrBlocked: expect.any(Object),
          evidenceOverdue: expect.any(Object),
        }),
      );
    });

    it("accepts search/pillar/institution/status/page/pageSize query params", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs")
        .query({ search: "energy", pillar: "generation-network", page: 1, pageSize: 10 })
        .set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("rejects an unknown query param", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs")
        .query({ notARealParam: "x" })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });

    it("rejects a pageSize above 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs")
        .query({ pageSize: 500 })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });

    it("rejects a non-integer page", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs")
        .query({ page: "not-a-number" })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /programs/:programmeId", () => {
    it("returns a real programme by id", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/${realProgrammeId}`)
        .set(...bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(realProgrammeId);
    });

    it("returns 404 for a nonexistent programme", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs/does-not-exist-programme")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /programs/:programmeId/projects", () => {
    it("returns the projects under a real programme", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/${realProgrammeId}/projects`)
        .set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("accepts search/status/page/pageSize query params", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/${realProgrammeId}/projects`)
        .query({ search: "a", status: "on-track", page: 1, pageSize: 10 })
        .set(...bearer(token));
      expect(res.status).toBe(200);
    });

    it("returns 404 for a nonexistent programme", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs/does-not-exist-programme/projects")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /programs/projects/:projectId", () => {
    it("returns a real project by id", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/projects/${realProjectId}`)
        .set(...bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(realProjectId);
    });

    it("returns 404 for a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs/projects/does-not-exist-project")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /programs/projects/:projectId/milestones", () => {
    it("returns milestones for a real project", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/projects/${realProjectId}/milestones`)
        .set(...bearer(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it("returns 404 for a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .get("/programs/projects/does-not-exist-project/milestones")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });

    it("rejects a pageSize above 200", async () => {
      const res = await request(app.getHttpServer())
        .get(`/programs/projects/${realProjectId}/milestones`)
        .query({ pageSize: 999 })
        .set(...bearer(token));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /programs (create programme)", () => {
    it("creates a programme with a valid payload", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          name: "E2E Test Programme",
          leadInstitution: "Sample DisCo",
          pillar: "generation-network",
          objectives: "Improve reliability across the network.",
          status: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
          financing: "World Bank",
        });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.record.name).toBe("E2E Test Programme");
      expect(typeof res.body.message).toBe("string");

      await prisma.programme.delete({ where: { id: res.body.record.id } }).catch(() => undefined);
    });

    it("rejects a programme name shorter than 3 characters", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          name: "AB",
          leadInstitution: "Sample DisCo",
          pillar: "generation-network",
          objectives: "Improve reliability across the network.",
          status: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid pillar slug", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          name: "E2E Invalid Pillar Programme",
          leadInstitution: "Sample DisCo",
          pillar: "not-a-real-pillar",
          objectives: "Improve reliability across the network.",
          status: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid status", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          name: "E2E Invalid Status Programme",
          leadInstitution: "Sample DisCo",
          pillar: "generation-network",
          objectives: "Improve reliability across the network.",
          status: "not-a-real-status",
          endDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("rejects a non-ISO8601 endDate", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          name: "E2E Bad Date Programme",
          leadInstitution: "Sample DisCo",
          pillar: "generation-network",
          objectives: "Improve reliability across the network.",
          status: "on-track",
          endDate: "not-a-date",
        });
      expect(res.status).toBe(400);
    });

    it("rejects a missing required field", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs")
        .set(...bearer(token))
        .send({
          leadInstitution: "Sample DisCo",
          pillar: "generation-network",
          objectives: "Improve reliability across the network.",
          status: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).post("/programs").send({
        name: "E2E Unauth Programme",
        leadInstitution: "Sample DisCo",
        pillar: "generation-network",
        objectives: "Improve reliability across the network.",
        status: "on-track",
        endDate: "2027-01-01T00:00:00.000Z",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Projects create/update/delete", () => {
    it("creates, updates, then deletes a project", async () => {
      const createRes = await request(app.getHttpServer())
        .post("/programs/projects")
        .set(...bearer(token))
        .send({
          name: "E2E Test Project",
          programmeId: realProgrammeId,
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
          comment: "Initial creation",
          pipelineReadiness: "pipeline",
        });
      expect(createRes.status).toBeGreaterThanOrEqual(200);
      expect(createRes.status).toBeLessThan(300);
      const projectId = createRes.body.record.id;
      expect(projectId).toBeTruthy();

      const updateRes = await request(app.getHttpServer())
        .patch(`/programs/projects/${projectId}`)
        .set(...bearer(token))
        .send({
          name: "E2E Test Project (updated)",
          programmeId: realProgrammeId,
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "at-risk",
          endDate: "2027-06-01T00:00:00.000Z",
          pipelineReadiness: null,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.record.name).toBe("E2E Test Project (updated)");

      const deleteRes = await request(app.getHttpServer())
        .delete(`/programs/projects/${projectId}`)
        .set(...bearer(token));
      expect(deleteRes.status).toBeGreaterThanOrEqual(200);
      expect(deleteRes.status).toBeLessThan(300);

      const getAfterDelete = await request(app.getHttpServer())
        .get(`/programs/projects/${projectId}`)
        .set(...bearer(token));
      expect(getAfterDelete.status).toBe(404);
    });

    it("rejects a project missing the required pipelineReadiness key", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs/projects")
        .set(...bearer(token))
        .send({
          name: "E2E Missing Pipeline Key",
          programmeId: realProgrammeId,
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid pipelineReadiness value", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs/projects")
        .set(...bearer(token))
        .send({
          name: "E2E Bad Pipeline Readiness",
          programmeId: realProgrammeId,
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
          pipelineReadiness: "not-a-real-value",
        });
      expect(res.status).toBe(400);
    });

    it("returns 404 creating a project against a nonexistent programme", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs/projects")
        .set(...bearer(token))
        .send({
          name: "Orphan Project",
          programmeId: "does-not-exist-programme",
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
          pipelineReadiness: null,
        });
      expect(res.status).toBe(404);
    });

    it("returns 404 updating a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .patch("/programs/projects/does-not-exist-project")
        .set(...bearer(token))
        .send({
          name: "Ghost Project",
          programmeId: realProgrammeId,
          owner: "Sample DisCo",
          leadName: "Jane Doe",
          location: "Abuja",
          pillar: "generation-network",
          currentStatus: "on-track",
          endDate: "2027-01-01T00:00:00.000Z",
          pipelineReadiness: null,
        });
      expect(res.status).toBe(404);
    });

    it("returns 404 deleting a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .delete("/programs/projects/does-not-exist-project")
        .set(...bearer(token));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /programs/projects/:projectId/milestones", () => {
    it("creates a milestone under a real project", async () => {
      const res = await request(app.getHttpServer())
        .post(`/programs/projects/${realProjectId}/milestones`)
        .set(...bearer(token))
        .send({
          name: "E2E Test Milestone",
          leadInstitution: "Sample DisCo",
          expectedDate: "2027-01-01T00:00:00.000Z",
          priority: "standard",
          status: "on-track",
        });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.record.name).toBe("E2E Test Milestone");

      await prisma.milestone.delete({ where: { id: res.body.record.id } }).catch(() => undefined);
    });

    it("returns 404 for a nonexistent project", async () => {
      const res = await request(app.getHttpServer())
        .post("/programs/projects/does-not-exist-project/milestones")
        .set(...bearer(token))
        .send({
          name: "Orphan Milestone",
          leadInstitution: "Sample DisCo",
          expectedDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(404);
    });

    it("rejects a milestone with an empty name", async () => {
      const res = await request(app.getHttpServer())
        .post(`/programs/projects/${realProjectId}/milestones`)
        .set(...bearer(token))
        .send({
          name: "",
          leadInstitution: "Sample DisCo",
          expectedDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
    });

    it("rejects a non-ISO8601 expectedDate", async () => {
      const res = await request(app.getHttpServer())
        .post(`/programs/projects/${realProjectId}/milestones`)
        .set(...bearer(token))
        .send({
          name: "Bad Date Milestone",
          leadInstitution: "Sample DisCo",
          expectedDate: "not-a-date",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid bottleneckCategory", async () => {
      const res = await request(app.getHttpServer())
        .post(`/programs/projects/${realProjectId}/milestones`)
        .set(...bearer(token))
        .send({
          name: "Bad Bottleneck Milestone",
          leadInstitution: "Sample DisCo",
          expectedDate: "2027-01-01T00:00:00.000Z",
          bottleneckCategory: "not-a-real-category",
        });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app.getHttpServer())
        .post(`/programs/projects/${realProjectId}/milestones`)
        .send({
          name: "Unauthed Milestone",
          leadInstitution: "Sample DisCo",
          expectedDate: "2027-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(401);
    });
  });
});
