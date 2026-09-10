import { Module } from "@nestjs/common";
import { EmailService } from "@/notifications/email/email.service";
import { WebhooksService } from "@/notifications/webhooks/webhooks.service";
import { WebhooksController } from "@/notifications/webhooks/webhooks.controller";
import { NotificationsConsumer } from "@/notifications/notifications.consumer";

@Module({
  controllers: [WebhooksController],
  providers: [EmailService, WebhooksService, NotificationsConsumer],
  exports: [EmailService, WebhooksService],
})
export class NotificationsModule {}
