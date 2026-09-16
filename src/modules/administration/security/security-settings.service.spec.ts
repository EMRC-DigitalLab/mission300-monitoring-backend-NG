import type { PrismaService } from "@/prisma/prisma.service";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";

describe("SecuritySettingsService", () => {
  it("persists the system administrator's self-review choice", async () => {
    const upsert = jest.fn().mockResolvedValue({ allowSelfReview: true });
    const service = new SecuritySettingsService({
      securitySettings: { upsert },
    } as unknown as PrismaService);

    await expect(service.update(true)).resolves.toEqual({ allowSelfReview: true });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      create: { id: "global", allowSelfReview: true },
      update: { allowSelfReview: true },
    });
  });
});
