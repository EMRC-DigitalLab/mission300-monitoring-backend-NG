import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService) {}

  findAllDefinitions() {
    return this.prisma.kpiDefinition.findMany({
      where: { isActive: true },
      include: { pillar: true },
    });
  }

  findLatestValues(kpiDefinitionId: string) {
    return this.prisma.kpiValue.findMany({
      where: { kpiDefinitionId },
      orderBy: { approvedAt: "desc" },
      take: 50,
    });
  }
}
