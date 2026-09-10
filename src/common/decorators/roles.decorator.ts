import { SetMetadata } from "@nestjs/common";
import type { RoleName } from "@prisma/client";

export const ROLES_KEY = "roles";

// Usage: @Roles("SYSTEM_ADMINISTRATOR", "DATA_REVIEWER") on a controller or route.
// Must be paired with RolesGuard - the decorator only attaches metadata,
// it does not enforce anything by itself.
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
