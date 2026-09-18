import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "@/common/decorators/public.decorator";
import { ExecutiveOverviewService } from "@/modules/executive-overview/executive-overview.service";
import { StateDiscoService } from "@/modules/state-disco/state-disco.service";
import { StateDiscoQueryDto } from "@/modules/state-disco/dto/state-disco-query.dto";

@ApiTags("public")
@Controller("public")
export class PublicOverviewController {
  constructor(
    private readonly executiveOverview: ExecutiveOverviewService,
    private readonly stateDisco: StateDiscoService,
  ) {}

  @Public()
  @Get("overview")
  async getOverview() {
    const { deliveryStatus, ...overview } = await this.executiveOverview.getOverview({});
    return overview;
  }

  @Public()
  @Get("state-coverage")
  getStateCoverage(@Query() query: StateDiscoQueryDto) {
    return this.stateDisco.getStates(query);
  }
}
