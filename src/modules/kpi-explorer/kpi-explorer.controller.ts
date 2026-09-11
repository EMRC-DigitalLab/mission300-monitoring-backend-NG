import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { KpiExplorerService } from "@/modules/kpi-explorer/kpi-explorer.service";
import { KpiExplorerQueryDto } from "@/modules/kpi-explorer/dto/kpi-explorer-query.dto";
import { UpdateKpiMetadataDto } from "@/modules/kpi-explorer/dto/update-kpi-metadata.dto";
import { CreateKpiDto } from "@/modules/kpi-explorer/dto/create-kpi.dto";
import { SetKpiActiveDto } from "@/modules/kpi-explorer/dto/set-kpi-active.dto";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

// Both phases of the KPI Explorer rebuild: the read-only foundation
// (catalogue/filters/profile) and the 3 mutation endpoints (create, edit
// metadata, retire/restore) - all system-administrator only, per docs/
// API.md's explicit instruction that role enforcement (client-side only
// in the mock) must be real here. Route is "/kpi-explorer", distinct from
// the old "/kpis" module (a 2-route stub with no frontend caller, left
// as-is) - see m300-frontend's src/api/schemas/kpi-explorer.ts for the
// complete real contract.
@ApiTags("kpi-explorer")
@ApiBearerAuth()
@Controller("kpi-explorer")
export class KpiExplorerController {
  constructor(private readonly kpiExplorer: KpiExplorerService) {}

  @Get("filters")
  getFilters() {
    return this.kpiExplorer.getFilters();
  }

  @Get()
  getOverview(@Query() query: KpiExplorerQueryDto) {
    return this.kpiExplorer.getOverview(query);
  }

  // :id here is the human-facing code (e.g. "M300-GEN-004"), not Prisma's
  // internal cuid - see KpiDefinition.code's comment in schema.prisma.
  @Get("kpis/:id")
  getProfile(@Param("id") id: string) {
    return this.kpiExplorer.getProfile(id);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Patch("kpis/:id")
  @AuditAction("kpi.metadata_updated")
  updateMetadata(@Param("id") id: string, @Body() dto: UpdateKpiMetadataDto) {
    return this.kpiExplorer.updateMetadata(id, dto);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Post("kpis")
  @AuditAction("kpi.created")
  create(@Body() dto: CreateKpiDto) {
    return this.kpiExplorer.create(dto);
  }

  @Roles("SYSTEM_ADMINISTRATOR")
  @Patch("kpis/:id/active")
  @AuditAction("kpi.active_toggled")
  setActive(@Param("id") id: string, @Body() dto: SetKpiActiveDto) {
    return this.kpiExplorer.setActive(id, dto);
  }
}
