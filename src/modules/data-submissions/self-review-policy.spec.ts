import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "@/prisma/prisma.service";
import type { StorageService } from "@/storage/storage.service";
import type { RabbitmqService } from "@/events/rabbitmq.service";
import type { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";

describe("data-submission self-review policy", () => {
  it("rejects the submitter when the administrator disables self-review", async () => {
    const prisma = {
      submission: { findUnique: jest.fn().mockResolvedValue({ id: "submission-1", submittedById: "user-1", status: "PENDING", items: [] }) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const settings = { get: jest.fn().mockResolvedValue({ allowSelfReview: false }) } as unknown as SecuritySettingsService;
    const service = new DataSubmissionsService(
      prisma,
      {} as StorageService,
      {} as RabbitmqService,
      settings,
    );

    await expect(service.recordDecision(
      { id: "user-1", role: "VALIDATOR", roles: ["INSTITUTIONAL_DATA_PROVIDER", "VALIDATOR"], institutionId: null },
      "submission-1",
      { decision: "approved", comments: "Looks good" },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
