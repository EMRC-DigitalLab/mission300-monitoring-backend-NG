import { Module } from "@nestjs/common";
import { WebhooksService } from "@/notifications/webhooks/webhooks.service";
import { WebhooksController } from "@/notifications/webhooks/webhooks.controller";
import { NotificationsConsumer } from "@/notifications/notifications.consumer";
import { AuthModule } from "@/modules/auth/auth.module";
import { AdministrationModule } from "@/modules/administration/administration.module";

// EmailService is NOT provided here - it's global (see email.module.ts).
@Module({
  imports: [AuthModule, AdministrationModule], // AdministrationModule for BrandingService
  controllers: [WebhooksController],
  providers: [WebhooksService, NotificationsConsumer],
  exports: [WebhooksService],
})
export class NotificationsModule {}
