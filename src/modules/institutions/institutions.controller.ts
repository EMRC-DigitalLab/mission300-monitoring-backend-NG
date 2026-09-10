import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { InstitutionsService } from "@/modules/institutions/institutions.service";

@ApiTags("institutions")
@ApiBearerAuth()
@Controller("institutions")
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  findAll() {
    return this.institutions.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.institutions.findOne(id);
  }
}
