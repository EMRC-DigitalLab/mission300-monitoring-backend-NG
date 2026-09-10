import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

// Mirrors the frontend's "Stakeholders" page: two tabs, Institutions and
// Data custodians, backed by the same underlying tables as InstitutionsModule.
@Injectable()
export class StakeholdersService {
  constructor(private readonly prisma: PrismaService) {}

  findInstitutions() {
    return this.prisma.institution.findMany();
  }

  findDataCustodians() {
    return this.prisma.dataCustodian.findMany({ include: { institution: true } });
  }
}
