import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { StateDiscoService } from "@/modules/state-disco/state-disco.service";
import { StateDiscoQueryDto } from "@/modules/state-disco/dto/state-disco-query.dto";
import { UpsertDiscoPerformanceDto } from "@/modules/state-disco/dto/upsert-disco-performance.dto";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// Phase A of the State/DisCo rebuild: filters, overview and comparison
// (m300-frontend/src/api/schemas/state-disco/). Unlike Executive Overview
// and Pillar Dashboards this is real, externally-sourced DisCo performance
// data with no existing submission pipeline - admin-entered for now (see
// state-disco.mappers.ts's header comment), so the performance-entry route
// is gated the same way KPI metadata editing is. Supply/tariff, delivery
// and state views are Phase B/C, not yet added.
@ApiTags("state-disco")
@ApiBearerAuth()
@Controller("state-disco")
export class StateDiscoController {
  constructor(private readonly stateDisco: StateDiscoService) {}

  @Get("filters")
  getFilters() {
    return this.stateDisco.getFilters();
  }

  @Get("overview")
  getOverview(@Query() query: StateDiscoQueryDto) {
    return this.stateDisco.getOverview(query);
  }

  @Get("comparison")
  getComparison(@Query() query: StateDiscoQueryDto) {
    return this.stateDisco.getComparison(query);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Post("institutions/:institutionId/performance")
  @AuditAction("disco.performance_recorded")
  upsertPerformance(@Param("institutionId") institutionId: string, @Body() dto: UpsertDiscoPerformanceDto) {
    return this.stateDisco.upsertPerformance(institutionId, dto);
  }
}
