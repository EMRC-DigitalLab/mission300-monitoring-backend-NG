import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { WebhooksService } from "@/notifications/webhooks/webhooks.service";
import { CreateWebhookSubscriptionDto } from "@/notifications/webhooks/dto/create-webhook-subscription.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("webhooks")
@ApiBearerAuth()
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.webhooks.listForUser(user);
  }

  @Post()
  @AuditAction("webhook.created")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWebhookSubscriptionDto) {
    return this.webhooks.create(user, dto);
  }

  @Delete(":id")
  @AuditAction("webhook.deleted")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.webhooks.remove(user, id);
  }
}
