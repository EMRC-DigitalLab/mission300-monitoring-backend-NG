import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleName } from "@prisma/client";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";

// Enforces @Roles(...) metadata. Runs AFTER JwtAuthGuard, so request.user is
// already populated. A route with no @Roles() decorator is allowed for any
// authenticated user - roles are an allow-list, not a default-deny beyond auth.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!user || !(user.roles?.length ? user.roles : [user.role]).some((role) => requiredRoles.includes(role as RoleName))) {
      throw new ForbiddenException("Your role does not permit this action");
    }
    return true;
  }
}
