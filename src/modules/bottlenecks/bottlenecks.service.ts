import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import type { CreateBottleneckDto } from "@/modules/bottlenecks/dto/create-bottleneck.dto";

@Injectable()
export class BottlenecksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.bottleneck.findMany({ orderBy: { raisedAt: "desc" } });
  }

  findOne(id: string) {
    return this.prisma.bottleneck.findUnique({ where: { id } });
  }

  create(dto: CreateBottleneckDto) {
    return this.prisma.bottleneck.create({ data: dto });
  }
}
