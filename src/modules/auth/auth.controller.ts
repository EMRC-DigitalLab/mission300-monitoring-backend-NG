import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "@/modules/auth/auth.service";
import { IdentifyDto } from "@/modules/auth/dto/identify.dto";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.dto";
import { SetPasswordDto } from "@/modules/auth/dto/set-password.dto";
import { Public } from "@/common/decorators/public.decorator";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";

// Much stricter than the app-wide default (100/min) - these are the
// account-enumeration and credential-brute-force surfaces (see WEB-006,
// WEB-007 in the audit report). Keyed per-IP by ThrottlerGuard's default
// tracker, so this doesn't lock out other users of the same account.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/auth";
// 7 days in ms - matches JWT_REFRESH_TTL's own default (src/config/
// env.validation.ts); the cookie's own maxAge is cosmetic (the server-side
// RefreshToken.expiresAt is what's actually enforced) but should still
// roughly track it, not silently outlive or undercut the real TTL.
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Step 1 of login: confirms the email belongs to an active account and
  // returns just enough to show a "Welcome back, {name}" screen before
  // asking for the password.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("identify")
  @HttpCode(HttpStatus.OK)
  identify(@Body() dto: IdentifyDto) {
    return this.auth.identify(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...body } = await this.auth.login(dto);
    setRefreshCookie(res, refreshToken);
    return body;
  }

  // Silently issues a new access token from the httpOnly refresh cookie -
  // rotates that cookie in the same call, see AuthService.refresh().
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) throw new UnauthorizedException("No refresh session found.");

    const { accessToken, refreshToken } = await this.auth.refresh(token);
    setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  // Always 200 regardless of whether the account exists - see
  // AuthService.forgotPassword() for why.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto);
    return { message: "If that account exists, a reset link has been sent." };
  }

  // Redeems a token from either the invite email or the forgot-password
  // email - same mechanism, see AuthService.setPassword().
  @Public()
  @Post("set-password")
  @HttpCode(HttpStatus.OK)
  async setPassword(@Body() dto: SetPasswordDto) {
    await this.auth.setPassword(dto);
    return { message: "Password set. You can now log in." };
  }

  // WEB-008 fix: revokes every JWT issued to this account so far, not just
  // the caller's own copy of it - see AuthService.logout().
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { message: "Signed out." };
  }
}
