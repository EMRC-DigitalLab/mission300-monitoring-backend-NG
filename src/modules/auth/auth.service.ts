import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "@/prisma/prisma.service";
import type { LoginDto } from "@/modules/auth/dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      // Same error for "no such user" and "wrong password" - don't leak which one it was.
      throw new UnauthorizedException("Invalid email or password");
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        institutionId: user.institutionId,
      },
    };
  }
}
