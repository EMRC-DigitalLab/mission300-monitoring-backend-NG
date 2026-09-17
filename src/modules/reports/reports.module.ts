import { Module } from "@nestjs/common";
import { ReportsController } from "@/modules/reports/reports.controller";
import { ReportsService } from "@/modules/reports/reports.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
