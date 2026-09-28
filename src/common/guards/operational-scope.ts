import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { PrismaService } from "@/prisma/prisma.service";

export const OPERATIONAL_MANAGERS = ["SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER"] as const;
export const OPERATIONAL_WRITERS = [...OPERATIONAL_MANAGERS, "INSTITUTIONAL_DATA_PROVIDER"] as const;

// Operational ownership is stored as an institution name in the existing
// project/issue contract. Require an exact normalized match, never a substring
// or abbreviation that could accidentally grant access to another institution.
export async function assertOperationalInstitutionAccess(
  prisma: PrismaService,
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
    select: { name: true },
  });
  if (!institution || institution.name.trim().toLowerCase() !== owner.trim().toLowerCase()) {
    throw new ForbiddenException("You cannot modify another institution's records.");
  }
}
