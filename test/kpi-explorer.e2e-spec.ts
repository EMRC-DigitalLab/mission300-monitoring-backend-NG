import { INestApplication } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  createTestApp,
  request,
  loginAs,
  bearer,
  ADMIN_CREDENTIALS,
  PROVIDER_CREDENTIALS,
} from "./helpers/e2e";

describe("KPI Explorer (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let providerToken: string;
  let realKpiCode: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ({ token: adminToken } = await loginAs(app, ADMIN_CREDENTIALS));
    ({ token: providerToken } = await loginAs(app, PROVIDER_CREDENTIALS));

    const kpi = await prisma.kpiDefinition.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    if (!kpi) throw new Error("No active KPI exists in the database to test against.");
    realKpiCode = kpi.code;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /kpi-explorer/filters", () => {
    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).get("/kpi-explorer/filters");
      expect(res.status).toBe(401);
    });

    it("is readable by any authenticated role", async () => {
      const res = await request(app.getHttpServer()).get("/kpi-explorer/filters").set(...bearer(providerToken));
      expect(res.status).toBe(200);
    });
  });

  describe("GET /kpi-explorer", () => {
    it("returns the catalogue overview", async () => {
      const res = await request(app.getHttpServer()).get("/kpi-explorer").set(...bearer(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.catalogue.items)).toBe(true);
    });

    it("accepts all documented query params", async () => {
      const res = await request(app.getHttpServer())
        .get("/kpi-explorer")
        .query({
          search: "access",
          pillar: "generation-network",
          category: "Access",
          readiness: "core",
          validationStatus: "confirmed",
          sourceInstitution: "Sample DisCo",
          reportingPeriod: "2025-Q4",
          geography: "national",
          page: 1,
          pageSize: 10,
        })
        .set(...bearer(adminToken));
      expect(res.status).toBe(200);
    });

    it("rejects an unknown query param", async () => {
      const res = await request(app.getHttpServer())
        .get("/kpi-explorer")
        .query({ bogus: "x" })
        .set(...bearer(adminToken));
      expect(res.status).toBe(400);
    });

    it("rejects a pageSize above 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/kpi-explorer")
        .query({ pageSize: 999 })
        .set(...bearer(adminToken));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /kpi-explorer/kpis/:id", () => {
    it("returns a real KPI's profile by code", async () => {
      const res = await request(app.getHttpServer())
        .get(`/kpi-explorer/kpis/${realKpiCode}`)
        .set(...bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(realKpiCode);
    });

    it("returns 404 for a nonexistent KPI code", async () => {
      const res = await request(app.getHttpServer())
        .get("/kpi-explorer/kpis/DOES-NOT-EXIST")
        .set(...bearer(adminToken));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /kpi-explorer/kpis (SYSTEM_ADMINISTRATOR only)", () => {
    it("rejects a non-admin caller with 403", async () => {
      const res = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(providerToken))
        .send({
          id: "M300-E2E-001",
          name: "E2E Test KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(res.status).toBe(403);
    });

    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).post("/kpi-explorer/kpis").send({
        id: "M300-E2E-002",
        name: "E2E Test KPI",
        pillar: "generation-network",
        category: "Access",
        unit: "%",
        definition: "Share of the population with access.",
        formula: "connected / total",
        frequency: "Quarterly",
        sourceInstitution: "Sample DisCo",
        sourceDataset: "Sample Dataset",
        readiness: "core",
      });
      expect(res.status).toBe(401);
    });

    it("creates a KPI as an admin", async () => {
      const res = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "M300-E2E-003",
          name: "E2E Test KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.row.id).toBe("M300-E2E-003");

      await prisma.kpiDefinition.delete({ where: { code: "M300-E2E-003" } }).catch(() => undefined);
    });

    it("rejects a duplicate KPI id with a conflict", async () => {
      const first = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "M300-E2E-004",
          name: "E2E Duplicate KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(first.status).toBeGreaterThanOrEqual(200);
      expect(first.status).toBeLessThan(300);

      try {
        const second = await request(app.getHttpServer())
          .post("/kpi-explorer/kpis")
          .set(...bearer(adminToken))
          .send({
            id: "M300-E2E-004",
            name: "E2E Duplicate KPI Again",
            pillar: "generation-network",
            category: "Access",
            unit: "%",
            definition: "Share of the population with access.",
            formula: "connected / total",
            frequency: "Quarterly",
            sourceInstitution: "Sample DisCo",
            sourceDataset: "Sample Dataset",
            readiness: "core",
          });
        expect(second.status).toBe(409);
      } finally {
        await prisma.kpiDefinition.delete({ where: { code: "M300-E2E-004" } }).catch(() => undefined);
      }
    });

    it("rejects an id shorter than 3 characters", async () => {
      const res = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "AB",
          name: "E2E Test KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(res.status).toBe(400);
    });

    it("rejects an invalid readiness value", async () => {
      const res = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "M300-E2E-005",
          name: "E2E Test KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "not-a-real-tier",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /kpi-explorer/kpis/:id (metadata, SYSTEM_ADMINISTRATOR only)", () => {
    it("rejects a non-admin caller with 403", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}`)
        .set(...bearer(providerToken))
        .send({
          pillar: "generation-network",
          definition: "Updated definition",
          formula: "Updated formula",
          unit: "%",
          aggregation: "sum",
          frequency: "Quarterly",
          disaggregation: "None",
          limitations: "None",
          baseline: null,
          baselineLabel: "",
          target: null,
          targetLabel: "",
          targetDate: null,
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          sourceReference: "",
        });
      expect(res.status).toBe(403);
    });

    it("returns 404 for a nonexistent KPI code", async () => {
      const res = await request(app.getHttpServer())
        .patch("/kpi-explorer/kpis/DOES-NOT-EXIST")
        .set(...bearer(adminToken))
        .send({
          pillar: "generation-network",
          definition: "Updated definition",
          formula: "Updated formula",
          unit: "%",
          aggregation: "sum",
          frequency: "Quarterly",
          disaggregation: "None",
          limitations: "None",
          baseline: null,
          baselineLabel: "",
          target: null,
          targetLabel: "",
          targetDate: null,
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          sourceReference: "",
        });
      expect(res.status).toBe(404);
    });

    it("rejects an invalid pillar", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}`)
        .set(...bearer(adminToken))
        .send({
          pillar: "not-a-real-pillar",
          definition: "Updated definition",
          formula: "Updated formula",
          unit: "%",
          aggregation: "sum",
          frequency: "Quarterly",
          disaggregation: "None",
          limitations: "None",
          baseline: null,
          baselineLabel: "",
          target: null,
          targetLabel: "",
          targetDate: null,
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          sourceReference: "",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /kpi-explorer/kpis/:id/active (SYSTEM_ADMINISTRATOR only)", () => {
    it("rejects a non-admin caller with 403", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}/active`)
        .set(...bearer(providerToken))
        .send({ active: false, reason: "Test" });
      expect(res.status).toBe(403);
    });

    it("retires then restores a throwaway KPI as admin", async () => {
      const createRes = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "M300-E2E-006",
          name: "E2E Active Toggle KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(createRes.status).toBeGreaterThanOrEqual(200);
      expect(createRes.status).toBeLessThan(300);

      try {
        const retireRes = await request(app.getHttpServer())
          .patch("/kpi-explorer/kpis/M300-E2E-006/active")
          .set(...bearer(adminToken))
          .send({ active: false, reason: "E2E test retirement" });
        expect(retireRes.status).toBe(200);
        expect(retireRes.body.row.active).toBe(false);

        const restoreRes = await request(app.getHttpServer())
          .patch("/kpi-explorer/kpis/M300-E2E-006/active")
          .set(...bearer(adminToken))
          .send({ active: true, reason: "E2E test restore" });
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.row.active).toBe(true);
      } finally {
        await prisma.kpiDefinition.delete({ where: { code: "M300-E2E-006" } }).catch(() => undefined);
      }
    });

    it("rejects a non-boolean active value", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}/active`)
        .set(...bearer(adminToken))
        .send({ active: "not-a-boolean" });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /kpi-explorer/kpis/:id/current-value (SYSTEM_ADMINISTRATOR only)", () => {
    it("rejects a non-admin caller with 403", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}/current-value`)
        .set(...bearer(providerToken))
        .send({ value: 42, reportingPeriod: "Q4 2025", resultingStatus: "confirmed" });
      expect(res.status).toBe(403);
    });

    it("rejects an invalid resultingStatus", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/kpi-explorer/kpis/${realKpiCode}/current-value`)
        .set(...bearer(adminToken))
        .send({ value: 42, reportingPeriod: "Q4 2025", resultingStatus: "not-a-real-status" });
      expect(res.status).toBe(400);
    });

    it("sets the current value on a throwaway KPI as admin", async () => {
      const createRes = await request(app.getHttpServer())
        .post("/kpi-explorer/kpis")
        .set(...bearer(adminToken))
        .send({
          id: "M300-E2E-007",
          name: "E2E Current Value KPI",
          pillar: "generation-network",
          category: "Access",
          unit: "%",
          definition: "Share of the population with access.",
          formula: "connected / total",
          frequency: "Quarterly",
          sourceInstitution: "Sample DisCo",
          sourceDataset: "Sample Dataset",
          readiness: "core",
        });
      expect(createRes.status).toBeGreaterThanOrEqual(200);
      expect(createRes.status).toBeLessThan(300);

      try {
        const res = await request(app.getHttpServer())
          .patch("/kpi-explorer/kpis/M300-E2E-007/current-value")
          .set(...bearer(adminToken))
          .send({ value: 55.5, reportingPeriod: "E2E-TEST-PERIOD", resultingStatus: "provisional", note: "E2E test" });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe("M300-E2E-007");
      } finally {
        const kpi = await prisma.kpiDefinition.findUnique({ where: { code: "M300-E2E-007" } });
        if (kpi) {
          const submissions = await prisma.submission.findMany({
            where: { items: { some: { kpiDefinitionId: kpi.id } } },
            select: { id: true },
          });
          const submissionIds = submissions.map((s) => s.id);
          await prisma.kpiValue.deleteMany({ where: { kpiDefinitionId: kpi.id } });
          await prisma.reviewDecision.deleteMany({ where: { submissionId: { in: submissionIds } } });
          await prisma.submission.deleteMany({ where: { id: { in: submissionIds } } });
          await prisma.kpiDefinition.delete({ where: { code: "M300-E2E-007" } }).catch(() => undefined);
        }
      }
    });
  });
});
