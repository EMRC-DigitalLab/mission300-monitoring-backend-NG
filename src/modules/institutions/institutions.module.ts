import { Module } from "@nestjs/common";
import { InstitutionsController } from "@/modules/institutions/institutions.controller";
import { InstitutionsService } from "@/modules/institutions/institutions.service";

@Module({
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
