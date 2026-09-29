import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ExecutiveOverviewService } from "./executive-overview.service";

jest.mock("@/modules/kpi-explorer/kpi-explorer.mappers", () => ({
  toKpiProfile: (definition: { code: string }, values: unknown[]) => ({ code: definition.code, values }),
}));

describe("ExecutiveOverviewService profile loading", () => {
  const definitions = [
    { id: "id-a", code: "A" },
    { id: "id-b", code: "B" },
  ];
  const values = [
    { kpiDefinitionId: "id-b", period: "q1-2026" },
    { kpiDefinitionId: "id-a", period: "q2-2026" },
    { kpiDefinitionId: "id-a", period: "q1-2026" },
  ];

  function setup() {
    const prisma = {
      kpiDefinition: { findMany: jest.fn().mockResolvedValue(definitions) },
      kpiValue: { findMany: jest.fn().mockResolvedValue(values) },
    };
    const service = new ExecutiveOverviewService(prisma as unknown as PrismaService);
    return { prisma, service };
  }

  it("loads all definitions and values in two queries, preserving requested order and period scope", async () => {
    const { prisma, service } = setup();

    const profiles = await service["loadProfiles"](["B", "A"], [2026, 1]);

    expect(prisma.kpiDefinition.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kpiValue.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.kpiDefinition.findMany).toHaveBeenCalledWith({
      where: { code: { in: ["B", "A"] } },
      include: { pillar: true, targetPoints: true },
    });
    expect(prisma.kpiValue.findMany).toHaveBeenCalledWith({
      where: { kpiDefinitionId: { in: ["id-a", "id-b"] } },
      include: { sourceSubmissionItem: { include: { submission: true } } },
    });
    expect(profiles).toEqual([
      { code: "B", values: [values[0]] },
      { code: "A", values: [values[2]] },
    ]);
  });

  it("reports a missing KPI before loading values", async () => {
    const { prisma, service } = setup();

    await expect(service["loadProfiles"](["A", "missing"])).rejects.toThrow(NotFoundException);
    expect(prisma.kpiValue.findMany).not.toHaveBeenCalled();
  });
});
