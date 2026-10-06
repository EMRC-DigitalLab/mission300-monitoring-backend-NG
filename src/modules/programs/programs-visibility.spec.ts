import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { ProgramsService } from "@/modules/programs/programs.service";
import {
  isInstitutionScoped,
  milestoneVisibleTo,
  programmeVisibleTo,
  projectVisibleTo,
  resolveReadScope,
} from "@/modules/programs/programs-visibility";

const user = (role: string, institutionId: string | null = "inst-nerc", roles: string[] = []) =>
  ({ id: "u1", role, roles, institutionId }) as unknown as AuthenticatedUser;

const NERC = { institutionId: "inst-nerc", name: "Nigerian Electricity Regulatory Commission (NERC)", ownerNames: [] as string[] };

describe("isInstitutionScoped", () => {
  it("scopes an institutional data provider", () => {
    expect(isInstitutionScoped(user("INSTITUTIONAL_DATA_PROVIDER"))).toBe(true);
  });

  it.each(["SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER"])("does not scope %s", (role) => {
    expect(isInstitutionScoped(user(role))).toBe(false);
  });

  it("does not scope a provider who also holds a manager role", () => {
    expect(isInstitutionScoped(user("INSTITUTIONAL_DATA_PROVIDER", "i", ["INSTITUTIONAL_DATA_PROVIDER", "DASHBOARD_MANAGER"]))).toBe(false);
  });

  it("leaves other read roles unchanged", () => {
    expect(isInstitutionScoped(user("READ_ONLY_USER"))).toBe(false);
    expect(isInstitutionScoped(user("OVERSIGHT_USER"))).toBe(false);
  });
});

describe("visibility filters", () => {
  it("add no restriction when there is no scope", () => {
    expect(programmeVisibleTo(null)).toEqual({});
    expect(projectVisibleTo(null)).toEqual({});
    expect(milestoneVisibleTo(null)).toEqual({});
  });

  it("match nothing for a provider with no institution", () => {
    expect(programmeVisibleTo("none")).toEqual({ id: { in: [] } });
    expect(projectVisibleTo("none")).toEqual({ id: { in: [] } });
  });

  it("show a programme the institution leads, by id or exact name, or where it owns a project", () => {
    const where = programmeVisibleTo(NERC) as { OR: unknown[] };
    expect(where.OR).toContainEqual({ leadInstitutionId: "inst-nerc" });
    expect(where.OR).toContainEqual({ leadInstitution: { equals: NERC.name, mode: "insensitive" } });
    expect(where.OR).toContainEqual({
      projects: { some: { OR: [{ owner: { equals: NERC.name, mode: "insensitive" } }] } },
    });
  });

  it("never matches by substring, so a short or similar name cannot reveal another institution", () => {
    const serialised = JSON.stringify(programmeVisibleTo(NERC));
    expect(serialised).not.toContain("contains");
    expect(serialised).not.toContain("startsWith");
  });

  it("includes the other spellings of the institution that its projects use", () => {
    const niso = { institutionId: "seed-institution-niso-tcn", name: "NISO / TCN", ownerNames: ["Nigerian Independent System Operator (NISO)"] };
    const serialised = JSON.stringify(projectVisibleTo(niso));
    expect(serialised).toContain("Nigerian Independent System Operator (NISO)");
    expect(serialised).toContain("NISO / TCN");
  });

  it("scopes milestones through their project", () => {
    expect(milestoneVisibleTo(NERC)).toEqual({ project: projectVisibleTo(NERC) });
  });
});

describe("resolveReadScope", () => {
  const prismaWith = (found: { id: string; name: string } | null, owners: string[] = []) => ({
    institution: { findUnique: jest.fn().mockResolvedValue(found) },
    project: { findMany: jest.fn().mockResolvedValue(owners.map((owner) => ({ owner }))) },
  });

  it("returns null for a manager without touching the database", async () => {
    const prisma = prismaWith(null);
    expect(await resolveReadScope(prisma as never, user("SYSTEM_ADMINISTRATOR"))).toBeNull();
    expect(prisma.institution.findUnique).not.toHaveBeenCalled();
  });

  it("returns the provider's institution", async () => {
    const prisma = prismaWith({ id: "inst-nerc", name: NERC.name });
    expect(await resolveReadScope(prisma as never, user("INSTITUTIONAL_DATA_PROVIDER"))).toEqual(NERC);
  });

  it("collects the owner spellings that resolve to the institution and ignores the rest", async () => {
    const prisma = prismaWith(
      { id: "seed-institution-niso-tcn", name: "NISO / TCN" },
      ["Nigerian Independent System Operator (NISO)", "Rural Electrification Agency (REA)", "NISO / NERC"],
    );
    const scope = await resolveReadScope(prisma as never, user("INSTITUTIONAL_DATA_PROVIDER", "seed-institution-niso-tcn"));
    expect(scope).toEqual({
      institutionId: "seed-institution-niso-tcn",
      name: "NISO / TCN",
      ownerNames: ["Nigerian Independent System Operator (NISO)"],
    });
  });

  it("sees nothing when the institution no longer exists or is not set", async () => {
    expect(await resolveReadScope(prismaWith(null) as never, user("INSTITUTIONAL_DATA_PROVIDER"))).toBe("none");
    expect(await resolveReadScope(prismaWith(null) as never, user("INSTITUTIONAL_DATA_PROVIDER", null))).toBe("none");
  });
});

describe("ProgramsService reads for an institutional data provider", () => {
  function build() {
    const prisma = {
      institution: { findUnique: jest.fn().mockResolvedValue({ id: "inst-nerc", name: NERC.name }) },
      programme: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      project: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      pillar: { findMany: jest.fn().mockResolvedValue([]) },
      bottleneck: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new ProgramsService(prisma as never) };
  }

  it("restricts the programme, project and milestone queries behind the overview", async () => {
    const { prisma, service } = build();
    await service.getOverview(user("INSTITUTIONAL_DATA_PROVIDER"), {} as never);

    expect(prisma.programme.findMany.mock.calls[0][0].where).toEqual(programmeVisibleTo(NERC));
    const projectCall = prisma.project.findMany.mock.calls.find(([args]) => args.where !== undefined);
    expect(projectCall?.[0].where).toEqual(projectVisibleTo(NERC));
    expect(prisma.milestone.findMany.mock.calls[0][0].where).toEqual(milestoneVisibleTo(NERC));
  });

  it("does not restrict an administrator", async () => {
    const { prisma, service } = build();
    await service.getOverview(user("SYSTEM_ADMINISTRATOR", null), {} as never);
    expect(prisma.programme.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("answers not found, not forbidden, for another institution's programme", async () => {
    const { service } = build();
    await expect(service.getProgramme(user("INSTITUTIONAL_DATA_PROVIDER"), "other-programme")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("answers not found for another institution's project", async () => {
    const { service } = build();
    await expect(service.getProject(user("INSTITUTIONAL_DATA_PROVIDER"), "other-project")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("limits the institution filter to visible programmes", async () => {
    const { prisma, service } = build();
    await service.getFilters(user("INSTITUTIONAL_DATA_PROVIDER"));
    expect(prisma.programme.findMany.mock.calls[0][0].where).toEqual(programmeVisibleTo(NERC));
  });
});
