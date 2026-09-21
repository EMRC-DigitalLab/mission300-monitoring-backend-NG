import { Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { NotificationsFeedService } from "@/notifications/feed/notifications-feed.service";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsFeedController {
  constructor(private readonly feed: NotificationsFeedService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.feed.list(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feed.markRead(user.id, id);
  }

  @Patch("read-all")
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.feed.markAllRead(user.id);
  }
}
