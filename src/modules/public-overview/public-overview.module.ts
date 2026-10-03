import { Module } from "@nestjs/common";
import { ExecutiveOverviewModule } from "@/modules/executive-overview/executive-overview.module";
import { StateDiscoModule } from "@/modules/state-disco/state-disco.module";
import { PublicOverviewController } from "@/modules/public-overview/public-overview.controller";
import { PublicOverviewService } from "@/modules/public-overview/public-overview.service";

@Module({
  imports: [ExecutiveOverviewModule, StateDiscoModule],
  controllers: [PublicOverviewController],
  providers: [PublicOverviewService],
})
export class PublicOverviewModule {}
