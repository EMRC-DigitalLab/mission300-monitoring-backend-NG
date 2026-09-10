import { Module } from "@nestjs/common";
import { ProgramsController } from "@/modules/programs/programs.controller";
import { ProgramsService } from "@/modules/programs/programs.service";

@Module({
  controllers: [ProgramsController],
  providers: [ProgramsService],
})
export class ProgramsModule {}
