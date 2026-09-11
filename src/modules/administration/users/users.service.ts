import { randomBytes } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { AccountStatus } from "@prisma/client";
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
      select: { id: true, email: true, fullName: true, role: true, status: true, institutionId: true },
    });
  }

  async invite(dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Same endpoint doubles as "resend invite" - the frontend has no
    // separate resend action, it just calls invite again. A PENDING account
    // was never activated, so there's nothing destructive about re-issuing
    // it: refresh the details in case the admin corrected them, and send a
    // fresh set-password link (old one, if any, stays invalid - it's a
    // separate PasswordResetToken row and only the latest one matters).
    if (existing) {
      if (existing.status !== AccountStatus.PENDING) {
        throw new ConflictException("A user with this email already exists.");
      }

      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { fullName: dto.fullName, role: dto.role, institutionId: dto.institutionId },
      });

      await this.rabbitmq.publish("user.invited", { userId: user.id, email: user.email });

      return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
    }

    // Starts PENDING (schema default) with a random, unusable password -
    // they can't log in until the set-password link (sent via the
    // "user.invited" consumer, see NotificationsConsumer) is redeemed.
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

  setStatus(id: string, status: AccountStatus) {
    return this.prisma.user.update({ where: { id }, data: { status } });
  }
}
