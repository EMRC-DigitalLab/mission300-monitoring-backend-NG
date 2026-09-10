import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { StakeholdersService } from "@/modules/stakeholders/stakeholders.service";

@ApiTags("stakeholders")
@ApiBearerAuth()
@Controller("stakeholders")
export class StakeholdersController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get("institutions")
  findInstitutions() {
    return this.stakeholders.findInstitutions();
  }

  @Get("data-custodians")
  findDataCustodians() {
    return this.stakeholders.findDataCustodians();
  }
}
