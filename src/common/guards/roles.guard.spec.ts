import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { RolesGuard } from "@/common/guards/roles.guard";

describe("RolesGuard with multiple assigned roles", () => {
  const guard = new RolesGuard({
    getAllAndOverride: () => ["VALIDATOR"],
  } as unknown as Reflector);

  function context(roles: string[]): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: "user-1", role: "INSTITUTIONAL_DATA_PROVIDER", roles } }) }),
    } as unknown as ExecutionContext;
  }

  it("allows an assigned secondary role", () => {
    expect(guard.canActivate(context(["INSTITUTIONAL_DATA_PROVIDER", "VALIDATOR"]))).toBe(true);
  });

  it("rejects a role that was not assigned", () => {
    expect(() => guard.canActivate(context(["INSTITUTIONAL_DATA_PROVIDER"]))).toThrow(
      "Your role does not permit this action",
    );
  });
});
