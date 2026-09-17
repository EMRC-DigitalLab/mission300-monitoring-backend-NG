import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";

class UpdateSecuritySettingsDto {
  @IsBoolean()
  allowSelfReview!: boolean;
}

@ApiTags("administration/security")
@ApiBearerAuth()
@Roles("SYSTEM_ADMINISTRATOR")
@Controller("administration/security")
export class SecuritySettingsController {
  constructor(private readonly settings: SecuritySettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  @AuditAction("security.self_review_policy_changed")
  update(@Body() dto: UpdateSecuritySettingsDto) {
    return this.settings.update(dto.allowSelfReview);
  }
}
