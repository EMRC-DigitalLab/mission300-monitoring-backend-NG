import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { KpisService } from "@/modules/kpis/kpis.service";

@ApiTags("kpis")
@ApiBearerAuth()
@Controller("kpis")
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get()
  findAll() {
    return this.kpis.findAllDefinitions();
  }

  @Get(":id/values")
  findValues(@Param("id") id: string) {
    return this.kpis.findLatestValues(id);
  }
}
