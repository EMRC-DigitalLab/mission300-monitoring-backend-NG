import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { ExecutiveOverviewService } from "@/modules/executive-overview/executive-overview.service";
import { ExecutiveOverviewQueryDto } from "@/modules/executive-overview/dto/executive-overview-query.dto";

// The Compact leadership view (m300-frontend/src/api/schemas/
// executive-overview.ts) - a pure read-composition layer over KPI Explorer
// (Sections A-C) and Programs/Bottlenecks (Section D). No entities of its
// own, same as Pillar Dashboards (per docs/database-structure.md).
@ApiTags("executive-overview")
@ApiBearerAuth()
@Controller("executive-overview")
export class ExecutiveOverviewController {
  constructor(private readonly executiveOverview: ExecutiveOverviewService) {}

  @Get()
  async getOverview(@Query() query: ExecutiveOverviewQueryDto, @Res({ passthrough: true }) response: Response) {
    const started = performance.now();
    const overview = await this.executiveOverview.getOverview(query);
    response.setHeader("Server-Timing", `overview;dur=${(performance.now() - started).toFixed(1)}`);
    return overview;
  }
}
