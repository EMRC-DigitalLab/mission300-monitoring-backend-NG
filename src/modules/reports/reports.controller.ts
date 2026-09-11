import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ReportsService } from "@/modules/reports/reports.service";
import { ReportsQueryDto } from "@/modules/reports/dto/reports-query.dto";
import { ReportConfigDto } from "@/modules/reports/dto/report-config.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// Reports & Exports (m300-frontend/src/api/schemas/reports.ts) - a pure
// read-composition layer over KPI Explorer/Programs/Bottlenecks/State &
// DisCo/Data Submissions, same pattern as Executive Overview. The backend
// never renders an actual PDF/XLSX file - confirmed directly from the real
// mock's own handler comment - so /preview and /generate both return the
// same {metadata, sections} JSON; the frontend builds the downloadable
// file client-side from it. No role-gating - the real mock has none for
// any of these routes.
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("filters")
  getFilters() {
    return this.reports.getFilters();
  }

  @Get()
  getOverview(@Query() query: ReportsQueryDto) {
    return this.reports.getOverview(query);
  }

  @Get("methodology")
  getMethodology() {
    return this.reports.getMethodology();
  }

  @Post("preview")
  @HttpCode(200)
  preview(@Body() dto: ReportConfigDto) {
    return this.reports.preview(dto);
  }

  @Post("generate")
  @AuditAction("report.requested")
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReportConfigDto) {
    return this.reports.generate(user, dto);
  }

  @Delete("saved/:id")
  @HttpCode(204)
  @AuditAction("report.deleted")
  async deleteSaved(@Param("id") id: string) {
    await this.reports.deleteSaved(id);
  }
}
