import type { PrismaService } from "@/prisma/prisma.service";
import { assertOperationalInstitutionAccess } from "./operational-scope";
import { ProgramsService } from "@/modules/programs/programs.service";

describe("Operational write ownership", () => {
  const provider = { id: "provider", role: "INSTITUTIONAL_DATA_PROVIDER", institutionId: "inst-a" };
  const prisma = { institution: { findUnique: jest.fn().mockResolvedValue({ name: "Institution A" }) } };

  it.each(["READ_ONLY_USER", "OVERSIGHT_USER", "DATA_REVIEWER", "VALIDATOR"])(
    "rejects %s even when the institution matches",
    async (role) => {
      await expect(
        assertOperationalInstitutionAccess(
          prisma as unknown as PrismaService,
          { ...provider, role },
          "Institution A",
        ),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it("permits providers only for their exact institution name", async () => {
    await expect(
      assertOperationalInstitutionAccess(prisma as unknown as PrismaService, provider, " institution a "),
    ).resolves.toBeUndefined();
    await expect(
      assertOperationalInstitutionAccess(prisma as unknown as PrismaService, provider, "Institution AB"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertOperationalInstitutionAccess(
        prisma as unknown as PrismaService,
        { ...provider, institutionId: null },
        "Institution A",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("honors manager permission on multi-role accounts", async () => {
    await expect(
      assertOperationalInstitutionAccess(
        prisma as unknown as PrismaService,
        { ...provider, roles: ["READ_ONLY_USER", "DASHBOARD_MANAGER"] },
        "Other institution",
      ),
    ).resolves.toBeUndefined();
  });
  it("blocks a provider's project deletion before any write to another institution", async () => {
    const db = {
      ...prisma,
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: "foreign", owner: "Institution B" }),
        delete: jest.fn(),
      },
    };
    await expect(
      new ProgramsService(db as unknown as PrismaService).deleteProject(provider, "foreign"),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.project.delete).not.toHaveBeenCalled();
  });
});
