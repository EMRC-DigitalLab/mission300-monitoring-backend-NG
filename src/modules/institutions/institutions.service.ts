import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.institution.findMany({ include: { dataCustodians: true } });
  }

  findOne(id: string) {
    return this.prisma.institution.findUnique({
      where: { id },
      include: { dataCustodians: true },
    });
  }
}
