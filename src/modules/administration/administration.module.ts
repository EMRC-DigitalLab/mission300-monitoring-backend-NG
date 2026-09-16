import { Module } from "@nestjs/common";
import { UsersController } from "@/modules/administration/users/users.controller";
import { UsersService } from "@/modules/administration/users/users.service";
import { AuditLogController } from "@/modules/administration/audit-log/audit-log.controller";
import { BrandingController } from "@/modules/administration/branding/branding.controller";
import { BrandingService } from "@/modules/administration/branding/branding.service";
import { OverviewController } from "@/modules/administration/overview/overview.controller";
import { OverviewService } from "@/modules/administration/overview/overview.service";
import { SecuritySettingsController } from "@/modules/administration/security/security-settings.controller";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";

@Module({
  controllers: [UsersController, AuditLogController, BrandingController, OverviewController, SecuritySettingsController],
  providers: [UsersService, BrandingService, OverviewService, SecuritySettingsService],
  // BrandingService is consumed outside this module too - AuthModule and
  // NotificationsModule inject it to pull the admin-configured colour/logo
  // into transactional emails (see notifications/email/templates/layout.ts).
  exports: [BrandingService, SecuritySettingsService],
})
export class AdministrationModule {}
