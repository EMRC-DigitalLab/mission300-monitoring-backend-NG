import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ReportsService } from "@/modules/reports/reports.service";
import { RequestReportDto } from "@/modules/reports/dto/request-report.dto";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.listForUser(user);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.findOne(user, id);
  }

  @Post()
  @AuditAction("report.requested")
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestReportDto) {
    return this.reports.request(user, dto);
  }

  @Delete(":id")
  @AuditAction("report.deleted")
  delete(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.delete(user, id);
  }
}
