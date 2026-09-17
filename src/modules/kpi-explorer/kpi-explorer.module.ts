import { Module } from "@nestjs/common";
import { KpiExplorerController } from "@/modules/kpi-explorer/kpi-explorer.controller";
import { KpiExplorerService } from "@/modules/kpi-explorer/kpi-explorer.service";

@Module({
  controllers: [KpiExplorerController],
  providers: [KpiExplorerService],
})
export class KpiExplorerModule {}
