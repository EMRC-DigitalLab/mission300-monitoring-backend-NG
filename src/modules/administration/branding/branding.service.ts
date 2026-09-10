import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import type { UpdateBrandingDto } from "@/modules/administration/branding/dto/update-branding.dto";

const SETTINGS_ID = "default";

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.brandingSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  update(dto: UpdateBrandingDto) {
    return this.prisma.brandingSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });
  }
}
