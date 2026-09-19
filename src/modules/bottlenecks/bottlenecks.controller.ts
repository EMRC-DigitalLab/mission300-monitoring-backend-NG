import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";
import { BottlenecksQueryDto } from "@/modules/bottlenecks/dto/bottlenecks-query.dto";
import { CreateBottleneckDto } from "@/modules/bottlenecks/dto/create-bottleneck.dto";
import { UpdateBottleneckStatusDto } from "@/modules/bottlenecks/dto/update-bottleneck-status.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// Phase B of the Programs/Bottlenecks rebuild: the full delivery-constraint
// register (m300-frontend/src/api/schemas/bottlenecks.ts) - richer than the
// lightweight shape Executive Overview's Section D shows, and distinct from
// its severity vocabulary (see bottlenecks.mappers.ts). No role-gating on
// the mutations - same confirmation as Programs (docs/API.md names only KPI
// editing and branding as needing a real server-side role check).
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
}
