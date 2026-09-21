import { Module } from "@nestjs/common";
import { ExecutiveOverviewController } from "@/modules/executive-overview/executive-overview.controller";
import { ExecutiveOverviewService } from "@/modules/executive-overview/executive-overview.service";

@Module({
  controllers: [ExecutiveOverviewController],
  providers: [ExecutiveOverviewService],
  exports: [ExecutiveOverviewService],
})
export class ExecutiveOverviewModule {}
