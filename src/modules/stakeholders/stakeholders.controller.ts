import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { StakeholdersService } from "@/modules/stakeholders/stakeholders.service";
import { StakeholdersQueryDto } from "@/modules/stakeholders/dto/stakeholders-query.dto";

@ApiTags("stakeholders")
@ApiBearerAuth()
@Controller("stakeholders")
export class StakeholdersController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  getOverview(@Query() query: StakeholdersQueryDto) {
    return this.stakeholders.getOverview(query);
  }

  @Get("institutions")
  findInstitutions() {
    return this.stakeholders.findInstitutions();
  }

  @Get("data-custodians")
  findDataCustodians() {
    return this.stakeholders.findDataCustodians();
  }
}
