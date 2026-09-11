import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { StateDiscoService } from "@/modules/state-disco/state-disco.service";
import { StateDiscoQueryDto } from "@/modules/state-disco/dto/state-disco-query.dto";
import { UpsertDiscoPerformanceDto } from "@/modules/state-disco/dto/upsert-disco-performance.dto";
import { UpsertDiscoServiceBandDto } from "@/modules/state-disco/dto/upsert-disco-service-band.dto";
import { CreateDiscoDeliveryMilestoneDto } from "@/modules/state-disco/dto/create-disco-delivery-milestone.dto";
import { UpdateDiscoDeliveryMilestoneDto } from "@/modules/state-disco/dto/update-disco-delivery-milestone.dto";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// Phases A+B of the State/DisCo rebuild: filters, overview, comparison,
// supply-tariff and delivery (m300-frontend/src/api/schemas/state-disco/).
// Unlike Executive Overview and Pillar Dashboards this is real,
// externally-sourced DisCo performance data with no existing submission
// pipeline - admin-entered for now (see state-disco.mappers.ts's header
// comment), so every mutation here is gated the same way KPI metadata
// editing is. The state view is Phase C, not yet added.
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

  @Get("supply-tariff")
  getSupplyTariff(@Query() query: StateDiscoQueryDto) {
    return this.stateDisco.getSupplyTariff(query);
  }

  @Get("delivery")
  getDelivery(@Query() query: StateDiscoQueryDto) {
    return this.stateDisco.getDelivery(query);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Post("institutions/:institutionId/performance")
  @AuditAction("disco.performance_recorded")
  upsertPerformance(@Param("institutionId") institutionId: string, @Body() dto: UpsertDiscoPerformanceDto) {
    return this.stateDisco.upsertPerformance(institutionId, dto);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Post("institutions/:institutionId/service-bands")
  @AuditAction("disco.service_band_recorded")
  upsertServiceBand(@Param("institutionId") institutionId: string, @Body() dto: UpsertDiscoServiceBandDto) {
    return this.stateDisco.upsertServiceBand(institutionId, dto);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Post("institutions/:institutionId/delivery-milestones")
  @AuditAction("disco.milestone_created")
  createDeliveryMilestone(
    @Param("institutionId") institutionId: string,
    @Body() dto: CreateDiscoDeliveryMilestoneDto,
  ) {
    return this.stateDisco.createDeliveryMilestone(institutionId, dto);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Patch("delivery-milestones/:milestoneId")
  @AuditAction("disco.milestone_updated")
  updateDeliveryMilestone(
    @Param("milestoneId") milestoneId: string,
    @Body() dto: UpdateDiscoDeliveryMilestoneDto,
  ) {
    return this.stateDisco.updateDeliveryMilestone(milestoneId, dto);
  }
}
