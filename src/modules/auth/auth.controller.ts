import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "@/modules/auth/auth.service";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { Public } from "@/common/decorators/public.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
