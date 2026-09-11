import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DataSubmissionsService } from "@/modules/data-submissions/data-submissions.service";
import { DataSubmissionsQueryDto } from "@/modules/data-submissions/dto/data-submissions-query.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";

// Phase 1 of the Data Submissions rebuild: the read-only foundation
// (filters/datasets/obligations/submissions/overdue/gaps). Upload/manual-
// entry (Phase 2) and the validation queue/decision endpoints (Phase 3)
// land in this same controller later - see m300-frontend's
// src/features/data-submissions/api.ts for the complete real contract
// this is being built to match.
@ApiTags("data-submissions")
@ApiBearerAuth()
@Controller("data-submissions")
export class DataSubmissionsController {
  constructor(private readonly dataSubmissions: DataSubmissionsService) {}

  @Get("filters")
  getFilters() {
    return this.dataSubmissions.getFilters();
  }

  @Get("datasets")
  getDatasets() {
    return this.dataSubmissions.getDatasets();
  }

  @Get("obligations")
  getObligations(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getObligations(user, query);
  }

  @Get("submissions")
  getSubmissions(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getSubmissions(user, query);
  }

  @Get("overdue")
  getOverdue(@CurrentUser() user: AuthenticatedUser, @Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getOverdue(user, query);
  }

  @Get("gaps")
  getGaps(@Query() query: DataSubmissionsQueryDto) {
    return this.dataSubmissions.getGaps(query);
  }
}
