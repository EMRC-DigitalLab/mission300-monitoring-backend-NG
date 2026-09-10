import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import type { CreateProgramDto } from "@/modules/programs/dto/create-program.dto";

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.program.findMany({ include: { projects: true } });
  }

  findOne(id: string) {
    return this.prisma.program.findUnique({
      where: { id },
      include: { projects: { include: { bottlenecks: true } } },
    });
  }

  create(dto: CreateProgramDto) {
    return this.prisma.program.create({ data: dto });
  }
}
