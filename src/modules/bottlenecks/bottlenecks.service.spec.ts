import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "@/prisma/prisma.service";
import { BottlenecksService } from "./bottlenecks.service";
import { BottlenecksController } from "./bottlenecks.controller";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";

describe("Bottleneck deletion", () => {
  function setup(exists: boolean) {
    const tx = {
      bottleneck: {
        findUnique: jest.fn().mockResolvedValue(exists ? { id: "issue-1" } : null),
        delete: jest.fn().mockResolvedValue({ id: "issue-1" }),
      },
      escalation: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => Promise<void>) => work(tx)) };
    return { tx, service: new BottlenecksService(prisma as unknown as PrismaService) };
  }

  it("removes linked escalations before deleting the issue in a transaction", async () => {
    const { tx, service } = setup(true);
    await service.delete("issue-1");
    expect(tx.escalation.deleteMany).toHaveBeenCalledWith({ where: { bottleneckId: "issue-1" } });
    expect(tx.bottleneck.delete).toHaveBeenCalledWith({ where: { id: "issue-1" } });
    expect(tx.escalation.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.bottleneck.delete.mock.invocationCallOrder[0],
    );
  });

  it("returns not found without touching linked records", async () => {
    const { tx, service } = setup(false);
    await expect(service.delete("missing")).rejects.toThrow(NotFoundException);
    expect(tx.escalation.deleteMany).not.toHaveBeenCalled();
    expect(tx.bottleneck.delete).not.toHaveBeenCalled();
  });

  it("restricts deletion to administrators and dashboard managers", () => {
    expect(Reflect.getMetadata(ROLES_KEY, BottlenecksController.prototype.delete)).toEqual([
      "SYSTEM_ADMINISTRATOR",
      "DASHBOARD_MANAGER",
    ]);
  });
});
