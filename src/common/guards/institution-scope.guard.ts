import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

const UNSCOPED_ROLES = ["SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER", "OVERSIGHT_USER", "READ_ONLY_USER"];

/**
 * Blocks an institutional user (data provider, reviewer, validator) from
 * reading or writing another institution's data via a path param, e.g.
 * GET /institutions/:institutionId/submissions.
 *
 * IMPORTANT: this guard only covers the :institutionId path-param case. Any
 * endpoint that LISTS across institutions (e.g. GET /submissions?status=...)
 * must apply the same scoping inside the service layer by filtering the
 * Prisma query with the caller's institutionId - see scopeInstitutionFilter()
 * below. Never trust a client-supplied institutionId query param as a filter
 * for a non-admin caller.
 */
@Injectable()
export class InstitutionScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      params: Record<string, string>;
    }>();
    const { user, params } = request;

    if (UNSCOPED_ROLES.includes(user.role)) return true;

    const requestedInstitutionId = params.institutionId;
    if (!requestedInstitutionId) return true; // route doesn't scope by institution

    if (requestedInstitutionId !== user.institutionId) {
      throw new ForbiddenException("You cannot access another institution's data");
    }
    return true;
  }
}

/** Reuse the same allow-list from a service method's own scoping check. */
export function scopeInstitutionFilter(user: AuthenticatedUser): { institutionId?: string } {
  if (UNSCOPED_ROLES.includes(user.role)) return {};
  return { institutionId: user.institutionId ?? "__none__" };
}
