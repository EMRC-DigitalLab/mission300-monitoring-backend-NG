import { Module } from "@nestjs/common";
import { UsersController } from "@/modules/administration/users/users.controller";
import { UsersService } from "@/modules/administration/users/users.service";
import { AuditLogController } from "@/modules/administration/audit-log/audit-log.controller";
import { BrandingController } from "@/modules/administration/branding/branding.controller";
import { BrandingService } from "@/modules/administration/branding/branding.service";

@Module({
  controllers: [UsersController, AuditLogController, BrandingController],
  providers: [UsersService, BrandingService],
})
export class AdministrationModule {}
