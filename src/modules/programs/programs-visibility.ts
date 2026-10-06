import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { OPERATIONAL_MANAGERS } from "@/common/guards/operational-scope";
import { ownerMatchesInstitution } from "@/common/institutions/owner-match";
import type { PrismaService } from "@/prisma/prisma.service";

export type ReadScope = { institutionId: string; name: string; ownerNames: string[] } | "none" | null;

const nameMatch = (name: string) => ({ equals: name.trim(), mode: "insensitive" as const });
const ownedBy = (scope: { name: string; ownerNames: string[] }) => ({
  OR: [...new Set([scope.name, ...scope.ownerNames])].map((name) => ({ owner: nameMatch(name) })),
});

export function programmeVisibleTo(scope: ReadScope): Prisma.ProgrammeWhereInput {
  if (scope === null) return {};
  if (scope === "none") return { id: { in: [] } };
  return {
    OR: [
      { leadInstitutionId: scope.institutionId },
      { leadInstitution: nameMatch(scope.name) },
      { projects: { some: ownedBy(scope) } },
    ],
  };
}

export function projectVisibleTo(scope: ReadScope): Prisma.ProjectWhereInput {
  if (scope === null) return {};
  if (scope === "none") return { id: { in: [] } };
  return {
    OR: [
      ownedBy(scope),
      { programme: { OR: [{ leadInstitutionId: scope.institutionId }, { leadInstitution: nameMatch(scope.name) }] } },
    ],
  };
}

export function milestoneVisibleTo(scope: ReadScope): Prisma.MilestoneWhereInput {
  if (scope === null) return {};
  return { project: projectVisibleTo(scope) };
}

export function isInstitutionScoped(user: AuthenticatedUser): boolean {
  const roles = user.roles?.length ? user.roles : [user.role];
  if (roles.some((role) => OPERATIONAL_MANAGERS.some((manager) => manager === role))) return false;
  return roles.includes("INSTITUTIONAL_DATA_PROVIDER");
}

export async function resolveReadScope(
  prisma: Pick<PrismaService, "institution" | "project">,
  user: AuthenticatedUser,
): Promise<ReadScope> {
  if (!isInstitutionScoped(user)) return null;
  if (!user.institutionId) return "none";

  const institution = await prisma.institution.findUnique({
    where: { id: user.institutionId },
    select: { id: true, name: true },
  });
  if (!institution) return "none";

  const owners = await prisma.project.findMany({ select: { owner: true }, distinct: ["owner"] });
  const ownerNames = owners.map((entry) => entry.owner).filter((owner) => ownerMatchesInstitution(owner, institution));
  return { institutionId: institution.id, name: institution.name, ownerNames };
}
