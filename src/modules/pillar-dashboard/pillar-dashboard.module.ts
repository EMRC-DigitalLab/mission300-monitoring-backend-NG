import { Module } from "@nestjs/common";
import { PillarDashboardController } from "@/modules/pillar-dashboard/pillar-dashboard.controller";
import { PillarDashboardService } from "@/modules/pillar-dashboard/pillar-dashboard.service";

@Module({
  controllers: [PillarDashboardController],
  providers: [PillarDashboardService],
})
export class PillarDashboardModule {}
