import { Injectable, NotFoundException } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { toKebabCase } from "@/common/utils/enum-casing";
import {
  buildHeadlineCards,
  toMilestoneRecord,
  toProgrammeRecord,
  toProjectRecord,
} from "@/modules/programs/programs.mappers";
import { loadBottleneckIdsByLinkedRecord } from "@/modules/bottlenecks/bottlenecks.mappers";
import type { ProgramsQueryDto } from "@/modules/programs/dto/programs-query.dto";
import type { ProjectsQueryDto } from "@/modules/programs/dto/projects-query.dto";
import type { MilestonesQueryDto } from "@/modules/programs/dto/milestones-query.dto";
import type { CreateProgrammeDto } from "@/modules/programs/dto/create-programme.dto";
import type { CreateMilestoneDto } from "@/modules/programs/dto/create-milestone.dto";
import type { UpsertProjectDto } from "@/modules/programs/dto/upsert-project.dto";

const DEFAULT_PAGE_SIZE = 10;

const PROGRAMME_INCLUDE = { pillar: true } as const;
const PROJECT_INCLUDE = {
  pillar: true,
  programme: true,
  statusHistory: true,
  documents: true,
  updates: true,
} as const;
const MILESTONE_INCLUDE = { project: true } as const;

// A record that was just created cannot have any bottlenecks linked to it
// yet - [] directly, no need to query.
const NO_BOTTLENECKS: string[] = [];

const CURRENT_PERIOD_LABEL = () => {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${now.getUTCFullYear()}`;
};

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [pillars, institutions] = await Promise.all([
      this.prisma.pillar.findMany({ orderBy: { name: "asc" } }),
      this.prisma.programme.findMany({ select: { leadInstitution: true }, distinct: ["leadInstitution"] }),
    ]);

    const withAll = (label: string, options: { value: string; label: string }[]) => [
      { value: "all", label: `All ${label}` },
      ...options,
    ];

    return {
      pillars: withAll(
        "pillars",
        pillars.map((p) => ({ value: p.slug, label: p.name })),
      ),
      institutions: withAll(
        "institutions",
        institutions
          .map((i) => ({ value: i.leadInstitution, label: i.leadInstitution }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ),
      statuses: withAll(
        "statuses",
        Object.values(ExecutionStatus).map((status) => ({
          value: toKebabCase(status),
          label: titleCase(toKebabCase(status)),
        })),
      ),
    };
  }

  async getOverview(query: ProgramsQueryDto) {
    const [programmes, projects, milestones] = await Promise.all([
      this.prisma.programme.findMany({ include: PROGRAMME_INCLUDE, orderBy: { createdAt: "desc" } }),
      this.prisma.project.findMany({
        select: { id: true, currentStatus: true, evidenceUrl: true, updatedAt: true },
      }),
      this.prisma.milestone.findMany({
        select: {
          id: true,
          priority: true,
          expectedDate: true,
          status: true,
          actualDate: true,
          evidenceUrl: true,
          updatedAt: true,
        },
      }),
    ]);

    const evidenceCandidates = [
      ...projects.filter((p) => p.currentStatus !== "COMPLETED" && !p.evidenceUrl),
      ...milestones.filter((m) => m.status !== "COMPLETED" && !m.evidenceUrl),
    ];

    const headlineCards = buildHeadlineCards(
      programmes.map((p) => ({ status: p.status, pillar: p.pillar.slug })),
      projects,
      milestones,
      evidenceCandidates,
    );

    const search = query.search?.trim().toLowerCase() ?? "";
    const pillar = query.pillar ?? "all";
    const institution = query.institution ?? "all";
    const status = query.status ?? "all";

    const filtered = programmes.filter((p) => {
      const matchesSearch =
        !search || [p.id, p.name, p.leadInstitution].some((field) => field.toLowerCase().includes(search));
      return (
        matchesSearch &&
        (pillar === "all" || p.pillar.slug === pillar) &&
        (institution === "all" || p.leadInstitution === institution) &&
        (status === "all" || toKebabCase(p.status) === status)
      );
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { items, ...pageMeta } = paginate(filtered, page, pageSize);

    const bottleneckIds = await loadBottleneckIdsByLinkedRecord(
      this.prisma,
      items.map((p) => p.id),
    );

    return {
      lastUpdated: new Date().toISOString(),
      headlineCards,
      programmes: {
        items: items.map((p) => toProgrammeRecord(p, bottleneckIds.get(p.id) ?? [])),
        ...pageMeta,
      },
    };
  }

  async getProgramme(id: string) {
    const programme = await this.prisma.programme.findUnique({ where: { id }, include: PROGRAMME_INCLUDE });
    if (!programme) throw new NotFoundException("The programme was not found.");
    const bottleneckIds = await loadBottleneckIdsByLinkedRecord(this.prisma, [id]);
    return toProgrammeRecord(programme, bottleneckIds.get(id) ?? []);
  }

  async getProjectsForProgramme(programmeId: string, query: ProjectsQueryDto) {
    const programme = await this.prisma.programme.findUnique({ where: { id: programmeId } });
    if (!programme) throw new NotFoundException("The programme was not found.");

    const search = query.search?.trim().toLowerCase() ?? "";
    const status = query.status ?? "all";

    const projects = await this.prisma.project.findMany({
      where: { programmeId },
      include: PROJECT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    const filtered = projects.filter((p) => {
      const matchesSearch =
        !search || [p.id, p.name, p.owner, p.location].some((field) => field.toLowerCase().includes(search));
      return matchesSearch && (status === "all" || toKebabCase(p.currentStatus) === status);
    });

    const bottleneckIds = await loadBottleneckIdsByLinkedRecord(
      this.prisma,
      filtered.map((p) => p.id),
    );
    const records = filtered.map((p) => toProjectRecord(p, bottleneckIds.get(p.id) ?? []));
    return paginate(records, query.page ?? 1, Math.min(200, query.pageSize ?? 10));
  }

  async getProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException("The project was not found.");
    const bottleneckIds = await loadBottleneckIdsByLinkedRecord(this.prisma, [projectId]);
    return toProjectRecord(project, bottleneckIds.get(projectId) ?? []);
  }

  async getMilestonesForProject(projectId: string, query: MilestonesQueryDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("The project was not found.");

    const milestones = await this.prisma.milestone.findMany({
      where: { projectId },
      include: MILESTONE_INCLUDE,
      orderBy: { expectedDate: "asc" },
    });
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    return paginate(milestones.map(toMilestoneRecord), query.page ?? 1, pageSize);
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("The project was not found.");

    const milestone = await this.prisma.milestone.create({
      data: {
        projectId,
        name: dto.name,
        leadInstitution: dto.leadInstitution,
        expectedDate: new Date(dto.expectedDate),
        priority: dto.priority,
        status: dto.status,
        risk: dto.risk,
        nextAction: dto.nextAction,
        bottleneckCategory: dto.bottleneckCategory ?? null,
      },
      include: MILESTONE_INCLUDE,
    });
    return { record: toMilestoneRecord(milestone), message: "Milestone added." };
  }

  async createProgramme(dto: CreateProgrammeDto) {
    const pillar = await this.prisma.pillar.findUnique({ where: { slug: dto.pillar } });
    if (!pillar) throw new NotFoundException("Unknown pillar.");

    const programme = await this.prisma.programme.create({
      data: {
        name: dto.name.trim(),
        leadInstitution: dto.leadInstitution.trim(),
        supportingInstitutions: [],
        pillarId: pillar.id,
        objectives: dto.objectives.trim(),
        financing: dto.financing?.trim() || null,
        status: dto.status,
        priority: "STANDARD",
        startDate: new Date(),
        endDate: new Date(dto.endDate),
        bottleneckCategory: null,
        validationStatus: "PROVISIONAL",
      },
      include: PROGRAMME_INCLUDE,
    });

    return {
      record: toProgrammeRecord(programme, NO_BOTTLENECKS),
      message: `${programme.id} has been added to the programme register.`,
    };
  }

  async createProject(dto: UpsertProjectDto) {
    const programme = await this.prisma.programme.findUnique({ where: { id: dto.programmeId } });
    if (!programme) throw new NotFoundException("Select a valid programme.");

    const pillar = await this.prisma.pillar.findUnique({ where: { slug: dto.pillar } });
    if (!pillar) throw new NotFoundException("Unknown pillar.");

    const project = await this.prisma.project.create({
      data: {
        programmeId: programme.id,
        name: dto.name.trim(),
        owner: dto.owner.trim(),
        leadName: dto.leadName.trim(),
        location: dto.location.trim(),
        // Not part of the real create form - see the schema comment on
        // Project.latitude/longitude. 0,0 until a geocoding step exists.
        latitude: 0,
        longitude: 0,
        coverage: "To be confirmed",
        pillarId: pillar.id,
        lifecycleStage: "IDENTIFICATION",
        programType: "GOVERNMENT_FUNDED",
        fundingSource: null,
        fundingStructure: "To be confirmed",
        fundingStatus: "UNFUNDED",
        pipelineReadiness: dto.pipelineReadiness,
        projectedStatus: dto.currentStatus,
        currentStatus: dto.currentStatus,
        startDate: new Date(),
        endDate: new Date(dto.endDate),
        evidenceUrl: null,
        bottleneckCategory: null,
        comment: dto.comment?.trim() ?? "",
        suggestion: "",
        validationStatus: "PROVISIONAL",
        description: "Added from the Overview delivery-status admin form; full profile to be completed.",
        budgetUsd: 0,
        disbursedUsd: 0,
        contractor: null,
        contactName: dto.leadName.trim(),
        contactEmail: "unassigned@example.gov.ng",
        statusHistory: { create: { period: CURRENT_PERIOD_LABEL(), status: dto.currentStatus } },
      },
      include: PROJECT_INCLUDE,
    });

    return {
      record: toProjectRecord(project, NO_BOTTLENECKS),
      message: `${project.id} has been added to the project register.`,
    };
  }

  async updateProject(projectId: string, dto: UpsertProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw new NotFoundException("The project was not found.");

    const pillar = await this.prisma.pillar.findUnique({ where: { slug: dto.pillar } });
    if (!pillar) throw new NotFoundException("Unknown pillar.");

    const statusChanged = dto.currentStatus !== existing.currentStatus;

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name.trim(),
        programmeId: dto.programmeId,
        owner: dto.owner.trim(),
        leadName: dto.leadName.trim(),
        location: dto.location.trim(),
        pillarId: pillar.id,
        endDate: new Date(dto.endDate),
        comment: dto.comment?.trim() ?? existing.comment,
        pipelineReadiness: dto.pipelineReadiness,
        currentStatus: dto.currentStatus,
        ...(statusChanged
          ? { statusHistory: { create: { period: CURRENT_PERIOD_LABEL(), status: dto.currentStatus } } }
          : {}),
      },
      include: PROJECT_INCLUDE,
    });

    const bottleneckIds = await loadBottleneckIdsByLinkedRecord(this.prisma, [projectId]);
    return {
      record: toProjectRecord(project, bottleneckIds.get(projectId) ?? []),
      message: `${project.id} has been updated.`,
    };
  }

  async deleteProject(projectId: string) {
    const existing = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw new NotFoundException("The project was not found.");

    await this.prisma.project.delete({ where: { id: projectId } });
    return { message: `${existing.id} has been removed from the project register.` };
  }
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
