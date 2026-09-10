import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BottlenecksService } from "@/modules/bottlenecks/bottlenecks.service";
import { CreateBottleneckDto } from "@/modules/bottlenecks/dto/create-bottleneck.dto";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("bottlenecks")
@ApiBearerAuth()
@Controller("bottlenecks")
export class BottlenecksController {
  constructor(private readonly bottlenecks: BottlenecksService) {}

  @Get()
  findAll() {
    return this.bottlenecks.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.bottlenecks.findOne(id);
  }

  @Post()
  @AuditAction("bottleneck.created")
  create(@Body() dto: CreateBottleneckDto) {
    return this.bottlenecks.create(dto);
  }
}
