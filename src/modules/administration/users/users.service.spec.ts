import { RoleName } from "@prisma/client";
import type { PrismaService } from "@/prisma/prisma.service";
import type { RabbitmqService } from "@/events/rabbitmq.service";
import { UsersService } from "@/modules/administration/users/users.service";

describe("UsersService.updateRoles", () => {
  it("replaces an existing user's roles and primary-role compatibility field", async () => {
    const updatedUser = {
      id: "user-1",
      fullName: "Test User",
      email: "test@example.gov.ng",
      designation: "Officer",
      institution: { name: "EMRC" },
      role: RoleName.INSTITUTIONAL_DATA_PROVIDER,
      roles: [RoleName.INSTITUTIONAL_DATA_PROVIDER, RoleName.VALIDATOR],
      status: "ACTIVE",
      lastLogin: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const findUnique = jest.fn().mockResolvedValue({ id: "user-1" });
    const update = jest.fn().mockResolvedValue(updatedUser);
    const service = new UsersService({ user: { findUnique, update } } as unknown as PrismaService, {} as RabbitmqService);

    const response = await service.updateRoles("user-1", updatedUser.roles);

    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: RoleName.INSTITUTIONAL_DATA_PROVIDER, roles: updatedUser.roles },
      include: { institution: true },
    });
    expect(response).toMatchObject({
      role: "institutional-data-provider",
      roles: ["institutional-data-provider", "validator"],
    });
  });
});
