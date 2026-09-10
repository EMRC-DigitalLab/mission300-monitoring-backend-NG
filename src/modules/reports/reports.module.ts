import { Module } from "@nestjs/common";
import { ReportsController } from "@/modules/reports/reports.controller";
import { ReportsService } from "@/modules/reports/reports.service";
import { GenerateReportConsumer } from "@/events/consumers/generate-report.consumer";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, GenerateReportConsumer],
})
export class ReportsModule {}
