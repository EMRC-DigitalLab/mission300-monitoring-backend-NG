import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "@/modules/auth/auth.service";
import { IdentifyDto } from "@/modules/auth/dto/identify.dto";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.dto";
import { SetPasswordDto } from "@/modules/auth/dto/set-password.dto";
import { Public } from "@/common/decorators/public.decorator";

// Much stricter than the app-wide default (100/min) - these are the
// account-enumeration and credential-brute-force surfaces (see WEB-006,
// WEB-007 in the audit report). Keyed per-IP by ThrottlerGuard's default
// tracker, so this doesn't lock out other users of the same account.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
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
}
