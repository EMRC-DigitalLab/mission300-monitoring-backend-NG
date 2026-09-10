import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { RequestReportDto } from "@/modules/reports/dto/request-report.dto";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  async request(user: AuthenticatedUser, dto: RequestReportDto) {
    const report = await this.prisma.report.create({
      data: {
        requestedById: user.id,
        type: dto.type,
        format: dto.format,
        filters: dto.filters as Prisma.InputJsonValue,
      },
    });

    // Heavy work (querying + rendering PDF/XLSX) happens off the request
    // path - see events/consumers/generate-report.consumer.ts.
    await this.rabbitmq.publish("report.requested", { reportId: report.id });

    return report;
  }

  listForUser(user: AuthenticatedUser) {
    return this.prisma.report.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    if (report.requestedById !== user.id) {
      throw new ForbiddenException("You cannot access another user's report");
    }
    return report;
  }

  async delete(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    return this.prisma.report.delete({ where: { id } });
  }
}
