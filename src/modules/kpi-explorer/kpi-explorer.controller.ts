import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { KpiExplorerService } from "@/modules/kpi-explorer/kpi-explorer.service";
import { KpiExplorerQueryDto } from "@/modules/kpi-explorer/dto/kpi-explorer-query.dto";

// Phase 1 (read-only): catalogue/filters/profile. Phase 2 adds the 3
// mutation endpoints (create, edit metadata, retire/restore). Route is
// "/kpi-explorer", distinct from the old "/kpis" module (a 2-route stub
// with no frontend caller, left as-is) - see m300-frontend's
// src/api/schemas/kpi-explorer.ts for the complete real contract.
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
}
