import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { StakeholdersService } from "@/modules/stakeholders/stakeholders.service";
import { StakeholdersQueryDto } from "@/modules/stakeholders/dto/stakeholders-query.dto";
import {
  CreateDataCustodianDto,
  UpdateDataCustodianDto,
} from "@/modules/stakeholders/dto/upsert-data-custodian.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Roles } from "@/common/decorators/roles.decorator";

@ApiTags("stakeholders")
@ApiBearerAuth()
@Roles("SYSTEM_ADMINISTRATOR")
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

  @Post("data-custodians")
  @AuditAction("stakeholder.data_custodian_created")
  createDataCustodian(@Body() dto: CreateDataCustodianDto) {
    return this.stakeholders.createDataCustodian(dto);
  }

  @Patch("data-custodians/:id")
  @AuditAction("stakeholder.data_custodian_updated")
  updateDataCustodian(@Param("id") id: string, @Body() dto: UpdateDataCustodianDto) {
    return this.stakeholders.updateDataCustodian(id, dto);
  }

  @Delete("data-custodians/:id")
  @AuditAction("stakeholder.data_custodian_deleted")
  deleteDataCustodian(@Param("id") id: string) {
    return this.stakeholders.deleteDataCustodian(id);
  }
}
