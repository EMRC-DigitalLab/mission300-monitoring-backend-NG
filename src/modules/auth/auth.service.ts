import { randomBytes, createHash } from "node:crypto";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "@/prisma/prisma.service";
import { EmailService } from "@/notifications/email/email.service";
import { accountInvitedEmail, passwordResetEmail, type EmailBrand } from "@/notifications/email/templates";
import { BrandingService } from "@/modules/administration/branding/branding.service";
import type { IdentifyDto } from "@/modules/auth/dto/identify.dto";
import type { LoginDto } from "@/modules/auth/dto/login.dto";
import type { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.dto";
import type { SetPasswordDto } from "@/modules/auth/dto/set-password.dto";

const SET_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000; // invite link: 24h
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000; // forgot-password link: 1h

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly branding: BrandingService,
  ) {}

  /** Whatever an admin has currently saved in Administration > Customization. */
  private async getEmailBrand(): Promise<EmailBrand> {
    const settings = await this.branding.get();
    return {
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      logoUrl: settings.logoUrl,
    };
  }

  /**
   * Step 1 of the two-step login flow. Deliberately identical response
   * (404, same message) whether the email doesn't exist or exists but
   * isn't ACTIVE (PENDING/INACTIVE/SUSPENDED) - never reveal which.
   */
  async identify({ email }: IdentifyDto) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { institution: true },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new NotFoundException("We could not find an active account for that email.");
    }
    return { email: user.email, displayName: user.fullName, institution: user.institution?.name ?? "" };
  }

  /** Step 2. One generic 401 for every failure reason - never reveal which. */
  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      user.status !== AccountStatus.ACTIVE ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id });

    // Read by userAccountSchema.lastLogin in the Administration module's
    // user table (see overview.mappers.ts) - null until this fires once.
    void this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        roles: user.roles.length ? user.roles : [user.role],
        institutionId: user.institutionId,
      },
    };
  }

  /**
   * Always resolves the same way regardless of whether the account exists -
   * full enumeration protection (stronger than identify(), which does leak
   * "is this account currently active"). Sends its own email directly
   * rather than going through the RabbitMQ event/webhook fan-out: a
   * password-reset link is a private security action, not a domain event
   * external webhook subscribers should ever see.
   */
  async forgotPassword({ email }: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== AccountStatus.ACTIVE) return;

    const token = await this.createPasswordResetToken(user.id, RESET_PASSWORD_TTL_MS);
    const resetUrl = `${process.env.FRONTEND_URL}/account/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail(
      { fullName: user.fullName, resetUrl },
      await this.getEmailBrand(),
    );
    await this.email.send({ to: user.email, subject, html });
  }

  /** Redeems a token from either the invite or forgot-password email. */
  async setPassword({ token, newPassword }: SetPasswordDto): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException("This link is invalid or has expired.");
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, status: AccountStatus.ACTIVE },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /**
   * Generates a raw token (returned to the caller to put in an email link),
   * storing only its hash - a stolen DB row can't be replayed as a working
   * link, same principle as password hashing. Used by both forgotPassword()
   * above and the invite flow (see NotificationsConsumer).
   *
   * Invalidates any earlier unused token for this user first - without
   * this, a re-invite (or a second forgot-password request) leaves the
   * OLD link live for its full TTL alongside the new one, so a stale link
   * from before an admin "revoked" it by re-inviting would still work.
   */
  async createPasswordResetToken(userId: string, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Builds the invite email's set-password link - used by NotificationsConsumer. */
  async sendAccountInvitedEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const token = await this.createPasswordResetToken(userId, SET_PASSWORD_TTL_MS);
    const setPasswordUrl = `${process.env.FRONTEND_URL}/account/set-password?token=${token}`;
    const { subject, html } = accountInvitedEmail(
      { fullName: user.fullName, setPasswordUrl },
      await this.getEmailBrand(),
    );
    await this.email.send({ to: user.email, subject, html });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
