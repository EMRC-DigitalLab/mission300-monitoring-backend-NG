import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { toUserAccountResponse } from "@/modules/administration/overview/overview.mappers";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { UpdateProfileDto } from "@/modules/profile/dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { institution: true },
    });
    return toUserAccountResponse(record);
  }

  async update(user: AuthenticatedUser, dto: UpdateProfileDto) {
    const record = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.name !== undefined ? { fullName: dto.name } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
      },
      include: { institution: true },
    });
    return toUserAccountResponse(record);
  }
}
