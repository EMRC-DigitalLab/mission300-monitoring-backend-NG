import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccountStatus, RoleName } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * Solves the invite-only chicken-and-egg problem: the invite endpoint
 * requires an existing SYSTEM_ADMINISTRATOR to call it, so something has to
 * create the very first one. Runs on every boot but only ever DOES anything
 * the moment the users table is empty - safe to leave in permanently.
 */
@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) return;

    const email = this.config.get<string>("BOOTSTRAP_ADMIN_EMAIL");
    const password = this.config.get<string>("BOOTSTRAP_ADMIN_PASSWORD");
    if (!email || !password) {
      this.logger.warn(
        "users table is empty and BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD are not set - " +
          "nobody can log in or invite anyone until a first user exists.",
      );
      return;
    }

    const passwordHash = await argon2.hash(password);
    await this.prisma.user.create({
      data: {
        email,
        fullName: "System Administrator",
        role: RoleName.SYSTEM_ADMINISTRATOR,
        roles: [RoleName.SYSTEM_ADMINISTRATOR],
        status: AccountStatus.ACTIVE,
        passwordHash,
      },
    });
    this.logger.log(`Bootstrap admin account created: ${email}`);
  }
}
