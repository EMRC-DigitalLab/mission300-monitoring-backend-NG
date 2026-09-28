import { randomBytes, createHash } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AccountStatus, type Prisma } from "@prisma/client";
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

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses "7d", "15m", etc. (the same shorthand JWT_ACCESS_TTL/JWT_REFRESH_TTL
 * already use for jsonwebtoken's own expiresIn) into a millisecond duration. */
function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration "${value}" - expected a number followed by s/m/h/d.`);
  return Number(match[1]) * DURATION_UNIT_MS[match[2]!]!;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly branding: BrandingService,
    private readonly config: ConfigService,
  ) {}

  private get refreshTokenTtlMs(): number {
    return parseDurationMs(this.config.get<string>("JWT_REFRESH_TTL", "7d"));
  }

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
   * Step 1 of the two-step login flow (WEB-006 fix). Always the same 200
   * response with just the email echoed back, whether the account doesn't
   * exist, isn't ACTIVE, or is a real active account - no status-code
   * oracle, no displayName/institution leak. Personalization now happens
   * only after a successful password verification in login() below.
   */
  async identify({ email }: IdentifyDto) {
    return { email };
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

    return this.prisma.$transaction(async (tx) => {
      // Lock the account and verify the password/session snapshot still holds.
      // A concurrent reset/suspension must not leave a new usable refresh token.
      const { count } = await tx.user.updateMany({
        where: {
          id: user.id,
          status: AccountStatus.ACTIVE,
          tokenVersion: user.tokenVersion,
          passwordHash: user.passwordHash,
        },
        data: { lastLogin: new Date() },
      });
      if (count !== 1) throw new UnauthorizedException("Invalid email or password");
      const accessToken = await this.jwt.signAsync({ sub: user.id, tokenVersion: user.tokenVersion });
      const refreshToken = await this.issueRefreshToken(tx, user.id);
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          roles: user.roles.length ? user.roles : [user.role],
          institutionId: user.institutionId,
        },
      };
    });
  }

  /**
   * Issues a new access token from a still-valid refresh token, rotating it
   * in the same call - the consumed row is revoked and a fresh one takes
   * its place, so a stolen-and-replayed old cookie value is caught
   * immediately (its hash no longer matches any non-revoked row) rather
   * than staying silently redeemable for its full remaining TTL.
   */
  async refresh(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.revokedAt || record.expiresAt <= new Date()) {
        throw new UnauthorizedException("Session expired - please log in again.");
      }
      // All credential changes lock the account before modifying token rows.
      const account = await tx.user.updateMany({
        where: { id: record.userId, status: AccountStatus.ACTIVE },
        data: { tokenVersion: { increment: 0 } },
      });
      if (account.count !== 1) throw new UnauthorizedException("Session expired - please log in again.");
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      const consumed = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException("Session expired - please log in again.");
      const refreshToken = await this.issueRefreshToken(tx, record.userId);
      const accessToken = await this.jwt.signAsync({ sub: user.id, tokenVersion: user.tokenVersion });
      return { accessToken, refreshToken };
    });
  }

  /**
   * Revokes every JWT issued to this user so far (WEB-008 fix) - bumping
   * tokenVersion means the next JwtStrategy.validate() call for any
   * previously-issued token fails the version check immediately, rather
   * than waiting out the token's own TTL. Also revokes every outstanding
   * refresh token, so a logout can't be silently bypassed by a refresh
   * token issued before it - the two credential types must die together.
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Generates a raw refresh token, storing only its hash - see
   * createPasswordResetToken's own comment for why. */
  private async issueRefreshToken(tx: Prisma.TransactionClient, userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await tx.refreshToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + this.refreshTokenTtlMs) },
    });
    return token;
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

    let token: string;
    try {
      token = await this.createPasswordResetToken(user.id, RESET_PASSWORD_TTL_MS);
    } catch (error) {
      if (error instanceof UnauthorizedException) return; // concurrent suspension, same generic response
      throw error;
    }
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
    await this.prisma.$transaction(async (tx) => {
      const expectedStatus = record.purpose === "INVITE" ? AccountStatus.PENDING : AccountStatus.ACTIVE;
      const account = await tx.user.updateMany({
        where: { id: record.userId, status: expectedStatus, tokenVersion: record.tokenVersion },
        data: { passwordHash, status: AccountStatus.ACTIVE, tokenVersion: { increment: 1 } },
      });
      if (account.count !== 1) throw new UnauthorizedException("This link is invalid or has expired.");
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          purpose: record.purpose,
          tokenVersion: record.tokenVersion,
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException("This link is invalid or has expired.");
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
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
  async createPasswordResetToken(
    userId: string,
    ttlMs: number,
    purpose: "RESET" | "INVITE" = "RESET",
  ): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.updateMany({
        where: { id: userId, status: purpose === "INVITE" ? AccountStatus.PENDING : AccountStatus.ACTIVE },
        data: { tokenVersion: { increment: 0 } },
      });
      if (account.count !== 1)
        throw new UnauthorizedException("This account cannot receive a recovery link.");
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMs),
          purpose,
          tokenVersion: user.tokenVersion,
        },
      });
    });
    return token;
  }

  /** Builds the invite email's set-password link - used by NotificationsConsumer. */
  async sendAccountInvitedEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== AccountStatus.PENDING) return;

    let token: string;
    try {
      token = await this.createPasswordResetToken(userId, SET_PASSWORD_TTL_MS, "INVITE");
    } catch (error) {
      if (error instanceof UnauthorizedException) return;
      throw error;
    }
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
