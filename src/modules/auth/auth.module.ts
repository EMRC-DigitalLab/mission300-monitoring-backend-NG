import { Module } from "@nestjs/common";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "@/modules/auth/auth.controller";
import { AuthService } from "@/modules/auth/auth.service";
import { JwtStrategy } from "@/modules/auth/jwt.strategy";
import { BootstrapAdminService } from "@/modules/auth/bootstrap-admin.service";
import { AdministrationModule } from "@/modules/administration/administration.module";

@Module({
  imports: [
    PassportModule,
    AdministrationModule, // for BrandingService - AuthService reads it to brand invite/reset emails
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_ACCESS_TTL", "15m") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, BootstrapAdminService],
  exports: [AuthService],
})
export class AuthModule {}
