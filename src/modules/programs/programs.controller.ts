import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ProgramsService } from "@/modules/programs/programs.service";
import { CreateProgramDto } from "@/modules/programs/dto/create-program.dto";
import { Roles } from "@/common/decorators/roles.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";

@ApiTags("programs")
@ApiBearerAuth()
@Controller("programs")
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  findAll() {
    return this.programs.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.programs.findOne(id);
  }

  @Roles("SYSTEM_ADMINISTRATOR", "DASHBOARD_MANAGER")
  @Post()
  @AuditAction("program.created")
  create(@Body() dto: CreateProgramDto) {
    return this.programs.create(dto);
  }
}
