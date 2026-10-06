import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { PrismaService } from "@/prisma/prisma.service";
import { ownerMatchesInstitution } from "@/common/institutions/owner-match";

export const OPERATIONAL_MANAGERS = ["SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER"] as const;
export const OPERATIONAL_WRITERS = [...OPERATIONAL_MANAGERS, "INSTITUTIONAL_DATA_PROVIDER"] as const;

// Loosened to just the one model delegate this actually touches, rather than
// the full PrismaService - a Prisma interactive-transaction client ($transaction's
// `tx` callback param) is structurally compatible with this but not with
// PrismaService's own type, so this can run inside a transaction too (see
// ProgramsService.bulkUploadProjects's per-row transaction).
type InstitutionLookup = Pick<PrismaService, "institution">;

// Operational ownership is stored as an institution name in the existing
// project/issue contract. Require an exact normalized match or a spelling that
// resolves to exactly this one institution (see ownerMatchesInstitution) -
// never a substring, and never a joint owner that names several bodies.
export async function assertOperationalInstitutionAccess(
  prisma: InstitutionLookup,
  user: AuthenticatedUser,
  owner: string,
): Promise<void> {
  const roles = user.roles?.length ? user.roles : [user.role];
  if (roles.some((role) => OPERATIONAL_MANAGERS.some((allowed) => allowed === role))) return;
  if (!roles.includes("INSTITUTIONAL_DATA_PROVIDER") || !user.institutionId) {
    throw new ForbiddenException("Your role does not permit this action.");
  }
  const institution = await prisma.institution.findUnique({
    where: { id: user.institutionId },
    select: { id: true, name: true },
  });
  if (!institution || !ownerMatchesInstitution(owner, institution)) {
    throw new ForbiddenException("You cannot modify another institution's records.");
  }
}
