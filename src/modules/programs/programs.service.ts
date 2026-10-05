import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import { assertOperationalInstitutionAccess } from "@/common/guards/operational-scope";
import { ExecutionStatus, type Pillar, type Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { toKebabCase } from "@/common/utils/enum-casing";
import { findInstitutionIdForSourceText } from "@/common/institutions/resolve-institution-record";
import {
  buildHeadlineCards,
  toMilestoneRecord,
  toProgrammeRecord,
  toProjectRecord,
} from "@/modules/programs/programs.mappers";
import {
  generateProjectsBulkTemplateBuffer,
  matchExecutionStatus,
  matchPillar,
  matchPipelineReadiness,
  parseProjectsBulkFile,
  type BulkUploadRow,
} from "@/modules/programs/programs-bulk-upload";
import { loadBottleneckIdsByLinkedRecord } from "@/modules/bottlenecks/bottlenecks.mappers";
import type { ProgramsQueryDto } from "@/modules/programs/dto/programs-query.dto";
import type { ProjectsQueryDto } from "@/modules/programs/dto/projects-query.dto";
import type { MilestonesQueryDto } from "@/modules/programs/dto/milestones-query.dto";
import type { CreateProgrammeDto } from "@/modules/programs/dto/create-programme.dto";
import type { CreateMilestoneDto } from "@/modules/programs/dto/create-milestone.dto";
import type { UpsertProjectDto } from "@/modules/programs/dto/upsert-project.dto";

const DEFAULT_PAGE_SIZE = 10;

const PROGRAMME_INCLUDE = { pillar: true, leadInstitutionRecord: true } as const;
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

  async createMilestone(user: AuthenticatedUser, projectId: string, dto: CreateMilestoneDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("The project was not found.");

    await assertOperationalInstitutionAccess(this.prisma, user, project.owner);

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

    const leadInstitutionId = await findInstitutionIdForSourceText(
      this.prisma,
      dto.leadInstitution,
    );

    const programme = await this.prisma.programme.create({
      data: {
        name: dto.name.trim(),
        leadInstitution: dto.leadInstitution.trim(),
        leadInstitutionId,
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

  async createProject(user: AuthenticatedUser, dto: UpsertProjectDto) {
    await assertOperationalInstitutionAccess(this.prisma, user, dto.owner);
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

  async updateProject(user: AuthenticatedUser, projectId: string, dto: UpsertProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw new NotFoundException("The project was not found.");

    await assertOperationalInstitutionAccess(this.prisma, user, existing.owner);
    await assertOperationalInstitutionAccess(this.prisma, user, dto.owner);

    const pillar = await this.prisma.pillar.findUnique({ where: { slug: dto.pillar } });
    if (!pillar) throw new NotFoundException("Unknown pillar.");

    const statusChanged = dto.currentStatus !== existing.currentStatus;

    const project = await this.prisma.project.update({
      where: { id: projectId, owner: existing.owner },
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

  async deleteProject(user: AuthenticatedUser, projectId: string) {
    const existing = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw new NotFoundException("The project was not found.");

    await assertOperationalInstitutionAccess(this.prisma, user, existing.owner);

    await this.prisma.project.delete({ where: { id: projectId, owner: existing.owner } });
    return { message: `${existing.id} has been removed from the project register.` };
  }

  async getProjectsBulkUploadTemplate(): Promise<Buffer> {
    const pillars = await this.prisma.pillar.findMany({ orderBy: { name: "asc" } });
    return generateProjectsBulkTemplateBuffer(pillars);
  }

  async bulkUploadProjects(user: AuthenticatedUser, file: Express.Multer.File | undefined, dryRun = false) {
    if (!file) throw new BadRequestException("Select a completed template to upload.");

    let rows: BulkUploadRow[];
    try {
      rows = await parseProjectsBulkFile(file.buffer, file.originalname);
    } catch {
      throw new BadRequestException("Could not read the uploaded file - use the provided template.");
    }
    if (rows.length === 0) throw new BadRequestException("The uploaded file has no data rows to upload.");

    const pillars = await this.prisma.pillar.findMany();
    const errors: { row: number; message: string }[] = [];
    let programmesCreated = 0;
    let programmesUpdated = 0;
    let projectsCreated = 0;
    let projectsUpdated = 0;
    // Only the first row naming a given programme writes that programme's
    // own fields (see programs-bulk-upload.ts's header comment) - later
    // rows for the same programme just need the name to match.
    const programmeIdByName = new Map<string, string>();

    // Not dry-run: each row commits in its own transaction the instant it
    // succeeds, so a mid-file crash keeps every row processed so far - the
    // rows already written are as real as if uploaded one at a time, only
    // a genuinely bad row rolls itself back. Dry-run: the ENTIRE loop runs
    // inside one transaction (so row 2 can still see row 1's programme,
    // exactly like a real run would resolve it), then that whole
    // transaction is deliberately aborted at the end via DRY_RUN_ABORT so
    // nothing persists - the counts below were still computed for real
    // against the current data, just never committed.
    const DRY_RUN_ABORT = Symbol("dry-run-abort");

    const runRow = async (db: ProgramsDb, row: BulkUploadRow) => {
      const outcome = await this.processBulkUploadRow(db, user, row, pillars, programmeIdByName);
      if (outcome.programmeCreated) programmesCreated += 1;
      if (outcome.programmeUpdated) programmesUpdated += 1;
      if (outcome.projectCreated) projectsCreated += 1;
      if (outcome.projectUpdated) projectsUpdated += 1;
    };

    if (dryRun) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const row of rows) {
            try {
              await runRow(tx, row);
            } catch (error) {
              errors.push({ row: row.rowNumber, message: bulkUploadRowErrorMessage(error) });
            }
          }
          throw DRY_RUN_ABORT;
        });
      } catch (thrown) {
        if (thrown !== DRY_RUN_ABORT) throw thrown;
      }
    } else {
      for (const row of rows) {
        try {
          await this.prisma.$transaction((tx) => runRow(tx, row));
        } catch (error) {
          errors.push({ row: row.rowNumber, message: bulkUploadRowErrorMessage(error) });
        }
      }
    }

    const processedSummary = `${programmesCreated + programmesUpdated} programme(s), ${projectsCreated + projectsUpdated} project(s)`;

    return {
      dryRun,
      totalRows: rows.length,
      programmesCreated,
      programmesUpdated,
      projectsCreated,
      projectsUpdated,
      errorCount: errors.length,
      errors,
      message: dryRun
        ? `Preview only - nothing was saved. ${processedSummary} would be processed${errors.length > 0 ? `, with ${errors.length} row error(s)` : ""}.`
        : errors.length === 0
          ? `Upload complete: ${processedSummary} processed.`
          : `Upload finished with ${errors.length} row error(s): ${processedSummary} were still processed successfully.`,
    };
  }

  /** One row's writes - both the programme (only when this is the first row
   * for that name) and the project - performed against `db`, which is
   * either `this.prisma` directly or a transaction's `tx`, so the exact
   * same logic serves the real, per-row-transactional upload and the
   * whole-file dry-run preview. Throws on any validation/access failure;
   * the caller decides what that means for the surrounding transaction. */
  private async processBulkUploadRow(
    db: ProgramsDb,
    user: AuthenticatedUser,
    row: BulkUploadRow,
    pillars: Pillar[],
    programmeIdByName: Map<string, string>,
  ): Promise<{
    programmeCreated: boolean;
    programmeUpdated: boolean;
    projectCreated: boolean;
    projectUpdated: boolean;
  }> {
    const v = row.values;
    const required: [string, string | undefined][] = [
      ["Programme name", v.programmeName],
      ["Programme lead institution", v.programmeLeadInstitution],
      ["Programme pillar", v.programmePillar],
      ["Programme objectives", v.programmeObjectives],
      ["Programme status", v.programmeStatus],
      ["Programme end date", v.programmeEndDate],
      ["Project name", v.projectName],
      ["Project owner institution", v.projectOwner],
      ["Project lead name", v.projectLeadName],
      ["Project location", v.projectLocation],
      ["Project pillar", v.projectPillar],
      ["Project status", v.projectStatus],
    ];
    const missing = required.filter(([, value]) => !value?.trim()).map(([label]) => label);
    if (missing.length > 0) {
      throw new BadRequestException(`Missing: ${missing.join(", ")}.`);
    }

    await assertOperationalInstitutionAccess(db, user, v.projectOwner!);

    let programmeCreated = false;
    let programmeUpdated = false;
    const programmeNameKey = v.programmeName!.trim().toLowerCase();
    let programmeId = programmeIdByName.get(programmeNameKey);

    if (!programmeId) {
      const programmePillar = matchPillar(v.programmePillar!, pillars);
      if (!programmePillar) throw new BadRequestException(`Unknown programme pillar "${v.programmePillar}".`);
      const programmeStatus = matchExecutionStatus(v.programmeStatus!);
      if (!programmeStatus) throw new BadRequestException(`Unknown programme status "${v.programmeStatus}".`);
      const programmeEndDate = parseCellDate(v.programmeEndDate!, "Programme end date");

      const existingProgramme = await db.programme.findFirst({
        where: { name: { equals: v.programmeName!.trim(), mode: "insensitive" } },
      });

      if (existingProgramme) {
        await db.programme.update({
          where: { id: existingProgramme.id },
          data: {
            leadInstitution: v.programmeLeadInstitution!.trim(),
            leadInstitutionId: await findInstitutionIdForSourceText(
              db,
              v.programmeLeadInstitution!,
            ),
            pillarId: programmePillar.id,
            objectives: v.programmeObjectives!.trim(),
            financing: v.programmeFinancing?.trim() || null,
            status: programmeStatus,
            endDate: programmeEndDate,
          },
        });
        programmeId = existingProgramme.id;
        programmeUpdated = true;
      } else {
        const created = await db.programme.create({
          data: {
            name: v.programmeName!.trim(),
            leadInstitution: v.programmeLeadInstitution!.trim(),
            leadInstitutionId: await findInstitutionIdForSourceText(
              db,
              v.programmeLeadInstitution!,
            ),
            supportingInstitutions: [],
            pillarId: programmePillar.id,
            objectives: v.programmeObjectives!.trim(),
            financing: v.programmeFinancing?.trim() || null,
            status: programmeStatus,
            priority: "STANDARD",
            startDate: new Date(),
            endDate: programmeEndDate,
            validationStatus: "PROVISIONAL",
          },
        });
        programmeId = created.id;
        programmeCreated = true;
      }
      programmeIdByName.set(programmeNameKey, programmeId);
    }

    const projectPillar = matchPillar(v.projectPillar!, pillars);
    if (!projectPillar) throw new BadRequestException(`Unknown project pillar "${v.projectPillar}".`);
    const projectStatus = matchExecutionStatus(v.projectStatus!);
    if (!projectStatus) throw new BadRequestException(`Unknown project status "${v.projectStatus}".`);
    const projectEndDate = v.projectEndDate?.trim() ? parseCellDate(v.projectEndDate, "Project end date") : null;
    const pipelineReadiness = v.pipelineReadiness ? matchPipelineReadiness(v.pipelineReadiness) : null;
    if (v.pipelineReadiness?.trim() && !pipelineReadiness) {
      throw new BadRequestException(`Unknown pipeline readiness "${v.pipelineReadiness}".`);
    }

    let projectCreated = false;
    let projectUpdated = false;
    const existingProject = await db.project.findFirst({
      where: { programmeId, name: { equals: v.projectName!.trim(), mode: "insensitive" } },
    });

    if (existingProject) {
      await assertOperationalInstitutionAccess(db, user, existingProject.owner);
      const statusChanged = projectStatus !== existingProject.currentStatus;
      await db.project.update({
        where: { id: existingProject.id },
        data: {
          owner: v.projectOwner!.trim(),
          leadName: v.projectLeadName!.trim(),
          location: v.projectLocation!.trim(),
          pillarId: projectPillar.id,
          currentStatus: projectStatus,
          projectedStatus: projectStatus,
          endDate: projectEndDate,
          pipelineReadiness,
          comment: v.comment?.trim() ?? existingProject.comment,
          ...(statusChanged
            ? { statusHistory: { create: { period: CURRENT_PERIOD_LABEL(), status: projectStatus } } }
            : {}),
        },
      });
      projectUpdated = true;
    } else {
      await db.project.create({
        data: {
          programmeId,
          name: v.projectName!.trim(),
          owner: v.projectOwner!.trim(),
          leadName: v.projectLeadName!.trim(),
          location: v.projectLocation!.trim(),
          latitude: 0,
          longitude: 0,
          coverage: "To be confirmed",
          pillarId: projectPillar.id,
          lifecycleStage: "IDENTIFICATION",
          programType: "GOVERNMENT_FUNDED",
          fundingSource: null,
          fundingStructure: "To be confirmed",
          fundingStatus: "UNFUNDED",
          pipelineReadiness,
          projectedStatus: projectStatus,
          currentStatus: projectStatus,
          startDate: new Date(),
          endDate: projectEndDate,
          comment: v.comment?.trim() ?? "",
          suggestion: "",
          validationStatus: "PROVISIONAL",
          description: "Added via bulk upload; full profile to be completed.",
          budgetUsd: 0,
          disbursedUsd: 0,
          contactName: v.projectLeadName!.trim(),
          contactEmail: "unassigned@example.gov.ng",
          statusHistory: { create: { period: CURRENT_PERIOD_LABEL(), status: projectStatus } },
        },
      });
      projectCreated = true;
    }

    return { programmeCreated, programmeUpdated, projectCreated, projectUpdated };
  }
}

type ProgramsDb = PrismaService | Prisma.TransactionClient;

function bulkUploadRowErrorMessage(error: unknown): string {
  const message =
    error instanceof BadRequestException || error instanceof ForbiddenException
      ? ((error.getResponse() as { message?: string })?.message ?? error.message)
      : "Could not process this row.";
  return Array.isArray(message) ? message.join(" ") : message;
}

function parseCellDate(value: string, label: string): Date {
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} "${value}" is not a valid date.`);
  return date;
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
