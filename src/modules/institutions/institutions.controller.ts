import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { InstitutionsService } from "@/modules/institutions/institutions.service";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { Roles } from "@/common/decorators/roles.decorator";

@ApiTags("institutions")
@ApiBearerAuth()
@Controller("institutions")
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  findAll() {
    return this.institutions.findAll();
  }

  @Roles("INSTITUTIONAL_DATA_PROVIDER")
  @Get("me/overview")
  getMyOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.institutions.getMyOverview(user);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.institutions.findOne(id);
  }
}
