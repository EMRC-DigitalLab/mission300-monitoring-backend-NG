import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Roles } from "@/common/decorators/roles.decorator";
import { OverviewService } from "@/modules/administration/overview/overview.service";
import { AdministrationQueryDto } from "@/modules/administration/overview/dto/administration-query.dto";

// Matches the real frontend contract exactly (src/features/administration/
// api.ts in m300-frontend): GET /administration (combined overview) and
// GET /administration/filters. Distinct from users.controller.ts's
// GET /administration/users, which the frontend never calls.
@ApiTags("administration")
@ApiBearerAuth()
@Roles("SYSTEM_ADMINISTRATOR")
@Controller("administration")
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get("filters")
  getFilters() {
    return this.overview.getFilters();
  }

  @Get()
  getOverview(@Query() query: AdministrationQueryDto) {
    return this.overview.getOverview(query);
  }
}
