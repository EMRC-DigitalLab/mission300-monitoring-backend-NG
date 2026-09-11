import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "@/modules/administration/users/users.service";
import { InviteUserDto } from "@/modules/administration/users/dto/invite-user.dto";
import { SetUserStatusDto } from "@/modules/administration/users/dto/set-user-status.dto";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("administration/users")
@ApiBearerAuth()
@Roles("SYSTEM_ADMINISTRATOR")
@Controller("administration/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post("invite")
  @AuditAction("user.invited")
  invite(@Body() dto: InviteUserDto) {
    return this.users.invite(dto);
  }

  @Patch(":id/status")
  @AuditAction("user.status_changed")
  setStatus(@Param("id") id: string, @Body() dto: SetUserStatusDto) {
    return this.users.setStatus(id, dto.status);
  }
}
