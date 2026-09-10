import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "@/prisma/prisma.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import type { InviteUserDto } from "@/modules/administration/users/dto/invite-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, isActive: true, institutionId: true },
    });
  }

  async invite(dto: InviteUserDto) {
    // Account starts with a random, unusable password; the invite flow (a
    // separate worker listening for "user.invited") is responsible for
    // emailing a set-password link with a signed token.
    const temporaryPassword = randomBytes(32).toString("hex");
    const passwordHash = await argon2.hash(temporaryPassword);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        institutionId: dto.institutionId,
        passwordHash,
      },
    });

    await this.rabbitmq.publish("user.invited", { userId: user.id, email: user.email });

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }
}
