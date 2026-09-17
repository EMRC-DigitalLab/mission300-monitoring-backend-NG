import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class SecuritySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.securitySettings.findUnique({ where: { id: "global" } });
    return { allowSelfReview: settings?.allowSelfReview ?? false };
  }

  async update(allowSelfReview: boolean) {
    const settings = await this.prisma.securitySettings.upsert({
      where: { id: "global" },
      create: { id: "global", allowSelfReview },
      update: { allowSelfReview },
    });
    return { allowSelfReview: settings.allowSelfReview };
  }
}
