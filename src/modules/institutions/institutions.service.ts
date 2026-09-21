import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { toObligationView } from "@/modules/data-submissions/data-submissions.mappers";
import { toInstitutionOverviewResponse } from "@/modules/institutions/institution-overview.mappers";

const OBLIGATION_INCLUDE = {
  institution: true,
  dataset: { include: { pillar: true, ownerInstitution: true } },
  focalPerson: true,
} as const;

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

  async getMyOverview(user: AuthenticatedUser) {
    if (!user.institutionId) {
      throw new NotFoundException("This account has no institution assigned.");
    }

    const institution = await this.prisma.institution.findUnique({ where: { id: user.institutionId } });
    if (!institution) throw new NotFoundException("Institution not found.");

    const [obligations, fulfilledCount] = await Promise.all([
      this.prisma.obligation.findMany({
        where: { institutionId: institution.id, acceptedSubmissionId: null },
        include: OBLIGATION_INCLUDE,
        orderBy: { dueDate: "asc" },
      }),
      this.prisma.obligation.count({
        where: { institutionId: institution.id, acceptedSubmissionId: { not: null } },
      }),
    ]);
    const obligationIds = obligations.map((o) => o.id);
    const latestSubmissions = await this.prisma.submission.findMany({
      where: { obligationId: { in: obligationIds } },
      orderBy: { createdAt: "desc" },
    });
    const latestByObligation = new Map<string, (typeof latestSubmissions)[number]>();
    for (const submission of latestSubmissions) {
      if (submission.obligationId && !latestByObligation.has(submission.obligationId)) {
        latestByObligation.set(submission.obligationId, submission);
      }
    }
    const obligationViews = obligations.map((o) => toObligationView(o, latestByObligation.get(o.id) ?? null));

    const latestKpiValues = await this.prisma.kpiValue.findMany({
      where: { institutionId: institution.id },
      include: { kpiDefinition: { include: { pillar: true } } },
      orderBy: { approvedAt: "desc" },
    });
    const kpisByDefinition = new Map<string, (typeof latestKpiValues)[number]>();
    for (const kpiValue of latestKpiValues) {
      if (!kpisByDefinition.has(kpiValue.kpiDefinitionId)) {
        kpisByDefinition.set(kpiValue.kpiDefinitionId, kpiValue);
      }
    }

    const [programmes, projects] = await Promise.all([
      this.prisma.programme.findMany({
        where: {
          OR: [{ leadInstitution: institution.name }, { supportingInstitutions: { has: institution.name } }],
        },
        include: { pillar: true, projects: true },
        orderBy: { startDate: "desc" },
      }),
      this.prisma.project.findMany({
        where: { owner: institution.name },
        include: { pillar: true, programme: true },
        orderBy: { startDate: "desc" },
      }),
    ]);

    return toInstitutionOverviewResponse({
      institution,
      obligationViews,
      fulfilledCount,
      kpis: [...kpisByDefinition.values()],
      programmes,
      projects,
    });
  }
}
