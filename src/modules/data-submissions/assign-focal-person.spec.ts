import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";

const OBLIGATION = {
  id: "obl-1",
  institutionId: "institution-nerc",
  datasetId: "nerc-disco-metering",
  reportingPeriod: "Q2 2026",
  dueDate: new Date("2026-07-15T00:00:00.000Z"),
  focalPersonId: null,
  acceptedSubmissionId: null,
  institution: { id: "institution-nerc", name: "NERC" },
  dataset: { id: "nerc-disco-metering", name: "DisCo Metering", frequency: "Quarterly" },
  focalPerson: null,
};

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    obligation: {
      findUnique: jest.fn().mockResolvedValue(OBLIGATION),
      update: jest.fn(async ({ data }: { data: { focalPersonId: string | null } }) => ({
        ...OBLIGATION,
        focalPersonId: data.focalPersonId,
        focalPerson: data.focalPersonId ? { fullName: "Named Officer" } : null,
      })),
    },
    user: { findUnique: jest.fn() },
    submission: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };

  const service = new DataSubmissionsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe("DataSubmissionsService.assignFocalPerson", () => {
  it("rejects an unknown obligation", async () => {
    const { service, prisma } = buildService({
      obligation: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });
    await expect(service.assignFocalPerson("missing", "usr-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown user", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.assignFocalPerson("obl-1", "ghost")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("refuses a focal person from a different institution than the one that owes the data", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: "usr-rea",
      fullName: "Wrong Institution",
      institutionId: "institution-rea",
    });

    await expect(service.assignFocalPerson("obl-1", "usr-rea")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("assigns a focal person who belongs to the owing institution", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: "usr-nerc",
      fullName: "Named Officer",
      institutionId: "institution-nerc",
    });

    const result = await service.assignFocalPerson("obl-1", "usr-nerc");

    expect(prisma.obligation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { focalPersonId: "usr-nerc" } }),
    );
    expect(result.obligation.focalPerson).toBe("Named Officer");
  });

  it("clears the focal person without checking institution membership", async () => {
    const { service, prisma } = buildService();

    const result = await service.assignFocalPerson("obl-1", null);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.obligation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { focalPersonId: null } }),
    );
    expect(result.obligation.focalPerson).toBe("Not supplied");
  });
});
