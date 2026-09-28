import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";
import { BottlenecksQueryDto } from "@/modules/bottlenecks/dto/bottlenecks-query.dto";
import { CreateBottleneckDto } from "@/modules/bottlenecks/dto/create-bottleneck.dto";
import { UpdateBottleneckStatusDto } from "@/modules/bottlenecks/dto/update-bottleneck-status.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { CurrentUser, type AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { OPERATIONAL_WRITERS } from "@/common/guards/operational-scope";

// Phase B of the Programs/Bottlenecks rebuild: the full delivery-constraint
// register (m300-frontend/src/api/schemas/bottlenecks.ts) - richer than the
// lightweight shape Executive Overview's Section D shows, and distinct from
// its severity vocabulary (see bottlenecks.mappers.ts). Creation and status
// updates require a permitted role and institution scope; deletion is manager-only.
@ApiTags("bottlenecks")
@ApiBearerAuth()
@Controller("bottlenecks")
export class BottlenecksController {
  constructor(private readonly bottlenecks: BottlenecksService) {}

  @Get("filters")
  getFilters() {
    return this.bottlenecks.getFilters();
  }

  @Get()
  getOverview(@Query() query: BottlenecksQueryDto) {
    return this.bottlenecks.getOverview(query);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("bottleneck.created")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBottleneckDto) {
    return this.bottlenecks.create(user, dto);
  }

  @Patch(":id")
  @Roles(...OPERATIONAL_WRITERS)
  @AuditAction("bottleneck.status_updated")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateBottleneckStatusDto,
  ) {
    return this.bottlenecks.updateStatus(user, id, dto);
  }

  @Get("by-project/:projectId")
  getByProject(@Param("projectId") projectId: string, @Query() query: BottlenecksQueryDto) {
    return this.bottlenecks.getByProject(projectId, query);
  }

  @Delete(":id")
  @HttpCode(204)
  @Roles("SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER")
  @AuditAction("bottleneck.deleted")
  delete(@Param("id") id: string) {
    return this.bottlenecks.delete(id);
  }
}
