import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";
import { resolveBottleneckVisibility } from "@/modules/bottlenecks/bottlenecks-visibility";
import { SearchService } from "@/modules/search/search.service";

const user = (role: string, institutionId: string | null = "seed-institution-niso-tcn") =>
  ({ id: "u1", role, roles: [], institutionId }) as unknown as AuthenticatedUser;

const provider = user("INSTITUTIONAL_DATA_PROVIDER");
const admin = user("SYSTEM_ADMINISTRATOR", null);

function buildPrisma() {
  return {
    institution: { findUnique: jest.fn().mockResolvedValue({ id: "seed-institution-niso-tcn", name: "NISO / TCN" }) },
    project: {
      findMany: jest.fn(async (args: { where?: unknown; include?: unknown; select?: { owner?: boolean; id?: boolean } }) =>
        args.include
          ? []
          : args.select?.owner
          ? [{ owner: "Nigerian Independent System Operator (NISO)" }, { owner: "Rural Electrification Agency (REA)" }]
          : [{ id: "proj-niso-1" }, { id: "proj-niso-2" }],
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    bottleneck: {
      findMany: jest.fn(async (args: { select?: { institution?: boolean } }) =>
        args.select?.institution ? [{ institution: "NISO / TCN" }, { institution: "Nigerian Independent System Operator (NISO)" }, { institution: "NERC" }] : [],
      ),
    },
    escalation: { findMany: jest.fn().mockResolvedValue([]) },
    programme: { findMany: jest.fn().mockResolvedValue([]) },
    pillar: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("resolveBottleneckVisibility", () => {
  it("adds no restriction for an administrator", async () => {
    expect(await resolveBottleneckVisibility(buildPrisma() as never, admin)).toEqual({});
  });

  it("matches nothing for a provider with no institution", async () => {
    expect(await resolveBottleneckVisibility(buildPrisma() as never, user("INSTITUTIONAL_DATA_PROVIDER", null))).toEqual({
      id: { in: [] },
    });
  });

  it("shows bottlenecks recorded under the institution's own spellings and on its visible projects", async () => {
    const where = (await resolveBottleneckVisibility(buildPrisma() as never, provider)) as { OR: unknown[] };
    const serialised = JSON.stringify(where);

    expect(serialised).toContain("NISO / TCN");
    expect(serialised).toContain("Nigerian Independent System Operator (NISO)");
    expect(where.OR).toContainEqual({ linkedRecord: { in: ["proj-niso-1", "proj-niso-2"] } });
  });

  it("does not include another institution's bottlenecks", async () => {
    const serialised = JSON.stringify(await resolveBottleneckVisibility(buildPrisma() as never, provider));
    expect(serialised).not.toContain("NERC");
    expect(serialised).not.toContain("Rural Electrification");
  });
});

describe("BottlenecksService reads", () => {
  it("restricts the register and the escalations for a provider", async () => {
    const prisma = buildPrisma();
    const service = new BottlenecksService(prisma as never);
    await service.getOverview(provider, {} as never).catch(() => undefined);

    const visible = await resolveBottleneckVisibility(buildPrisma() as never, provider);
    const registerCall = prisma.bottleneck.findMany.mock.calls.find(([args]) => (args as { include?: unknown }).include);
    expect((registerCall?.[0] as { where: unknown }).where).toEqual(visible);
    expect(prisma.escalation.findMany.mock.calls[0][0].where).toEqual({ bottleneck: visible });
  });

  it("answers not found for a project the provider cannot see", async () => {
    const service = new BottlenecksService(buildPrisma() as never);
    await expect(service.getByProject(provider, "other-project", {} as never)).rejects.toMatchObject({ status: 404 });
  });
});

describe("SearchService", () => {
  it("limits programme and project results for a provider", async () => {
    const prisma = buildPrisma();
    prisma.programme.findMany.mockResolvedValue([]);
    const service = new SearchService({ ...prisma, kpiDefinition: { findMany: jest.fn().mockResolvedValue([]) } } as never);
    await service.search(provider, "power");

    const programmeWhere = JSON.stringify(prisma.programme.findMany.mock.calls[0][0].where);
    expect(programmeWhere).toContain("seed-institution-niso-tcn");

    const projectCall = prisma.project.findMany.mock.calls.find(([args]) => (args as { include?: unknown }).include);
    expect(JSON.stringify((projectCall?.[0] as { where: unknown }).where)).toContain("seed-institution-niso-tcn");
  });

  it("leaves search unrestricted for an administrator", async () => {
    const prisma = buildPrisma();
    const service = new SearchService({ ...prisma, kpiDefinition: { findMany: jest.fn().mockResolvedValue([]) } } as never);
    await service.search(admin, "power");

    expect(prisma.programme.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ name: { contains: "power", mode: "insensitive" } }, {}],
    });
  });
});
