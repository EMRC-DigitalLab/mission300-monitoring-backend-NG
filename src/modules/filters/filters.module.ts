import { Module } from "@nestjs/common";
import { FiltersController } from "@/modules/filters/filters.controller";
import { FiltersService } from "@/modules/filters/filters.service";

@Module({
  controllers: [FiltersController],
  providers: [FiltersService],
})
export class FiltersModule {}
