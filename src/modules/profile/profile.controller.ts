import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ProfileService } from "@/modules/profile/profile.service";
import { UpdateProfileDto } from "@/modules/profile/dto/update-profile.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// No @Roles() anywhere here - deliberately: any authenticated user (all 7
// roles) can view and edit their OWN profile. This is unrelated to
// administration/users, which is the admin-only user management module.
@ApiTags("users")
@ApiBearerAuth()
@Controller("users/me")
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user);
  }

  @Patch()
  @AuditAction("user.profile_updated")
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user, dto);
  }
}
