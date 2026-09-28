import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";
import { BottlenecksQueryDto } from "@/modules/bottlenecks/dto/bottlenecks-query.dto";
import { CreateBottleneckDto } from "@/modules/bottlenecks/dto/create-bottleneck.dto";
import { UpdateBottleneckStatusDto } from "@/modules/bottlenecks/dto/update-bottleneck-status.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";

// Phase B of the Programs/Bottlenecks rebuild: the full delivery-constraint
// register (m300-frontend/src/api/schemas/bottlenecks.ts) - richer than the
// lightweight shape Executive Overview's Section D shows, and distinct from
// its severity vocabulary (see bottlenecks.mappers.ts). Creation and status
// updates retain their existing access policy; deletion is role-restricted.
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
  @AuditAction("bottleneck.created")
  create(@Body() dto: CreateBottleneckDto) {
    return this.bottlenecks.create(dto);
  }

  @Patch(":id")
  @AuditAction("bottleneck.status_updated")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateBottleneckStatusDto) {
    return this.bottlenecks.updateStatus(id, dto);
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
