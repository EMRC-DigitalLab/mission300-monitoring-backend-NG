import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ReportStatus } from "@prisma/client";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { PrismaService } from "@/prisma/prisma.service";

interface ReportRequestedPayload {
  reportId: string;
}

/**
 * Example async worker: listens for "report.requested", does the slow work
 * (querying + rendering a PDF/XLSX with exceljs / @react-pdf/renderer, then
 * writing to STORAGE_LOCAL_PATH) off the HTTP request path, and flips the
 * Report row to READY (or FAILED) when done.
 *
 * This is a template - wire in real rendering logic per report `type` once
 * the report specs are defined.
 */
@Injectable()
export class GenerateReportConsumer implements OnModuleInit {
  private readonly logger = new Logger(GenerateReportConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitmqService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.subscribe("reports.generate", ["report.requested"], (payload) =>
      this.handle(payload as ReportRequestedPayload),
    );
  }

  private async handle({ reportId }: ReportRequestedPayload) {
    this.logger.log(`Generating report ${reportId}`);
    await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.GENERATING },
    });

    try {
      // TODO: dispatch on report.type, query the relevant data, render the
      // file, and persist it via the storage driver (STORAGE_LOCAL_PATH).
      const fileUrl = `/storage/reports/${reportId}.pdf`;

      await this.prisma.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.READY, fileUrl, completedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Report ${reportId} generation failed`, error as Error);
      await this.prisma.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.FAILED, failureReason: (error as Error).message },
      });
    }
  }
}
