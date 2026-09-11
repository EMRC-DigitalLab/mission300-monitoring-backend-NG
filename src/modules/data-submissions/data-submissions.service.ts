import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { StorageService } from "@/storage/storage.service";
import { scopeInstitutionFilter } from "@/common/guards/institution-scope.guard";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { workflowStatus } from "@/modules/data-submissions/workflow-status";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { DataSubmissionsQueryDto } from "@/modules/data-submissions/dto/data-submissions-query.dto";
import type { ManualEntryDto } from "@/modules/data-submissions/dto/manual-entry.dto";
import {
  toDataGap,
  toDatasetView,
  toManualEntryDefinition,
  toObligationView,
  toOverdueItem,
  toSubmissionListItem,
  toUploadDefinition,
} from "@/modules/data-submissions/data-submissions.mappers";
import {
  buildSubmissionItems,
  generateTemplateBuffer,
  parseSubmissionFile,
  validateFieldValues,
} from "@/modules/data-submissions/dataset-template";

const DEFAULT_PAGE_SIZE = 20;

const DATASET_INCLUDE = { pillar: true, ownerInstitution: true } as const;
const OBLIGATION_INCLUDE = {
  institution: true,
  dataset: { include: DATASET_INCLUDE },
  focalPerson: true,
} as const;
const SUBMISSION_INCLUDE = {
  institution: true,
  submittedBy: true,
  obligation: { include: { dataset: true } },
} as const;
const OBLIGATION_WITH_FIELDS_INCLUDE = {
  institution: true,
  dataset: { include: { fields: true } },
} as const;

@Injectable()
export class DataSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getFilters() {
    const [institutions, datasets, obligationPeriods] = await Promise.all([
      this.prisma.institution.findMany({ orderBy: { name: "asc" } }),
      this.prisma.dataset.findMany({ orderBy: { name: "asc" } }),
      this.prisma.obligation.findMany({ select: { reportingPeriod: true }, distinct: ["reportingPeriod"] }),
    ]);
    const reportingPeriods = [...new Set(obligationPeriods.map((o) => o.reportingPeriod))].sort();

    const withAll = (label: string, options: { value: string; label: string }[]) => [
      { value: "all", label: `All ${label}` },
      ...options,
    ];

    return {
      institutions: withAll(
        "institutions",
        institutions.map((i) => ({ value: i.id, label: i.name })),
      ),
      datasets: withAll(
        "datasets",
        datasets.map((d) => ({ value: d.id, label: d.name })),
      ),
      reportingPeriods: withAll(
        "periods",
        reportingPeriods.map((p) => ({ value: p, label: p })),
      ),
      // Submission/validation status options mirror workflow-status.ts's
      // known codes - the ones actually reachable from this module.
      submissionStatuses: withAll("statuses", [
        { value: "draft", label: "Draft" },
        { value: "pending-review", label: "Pending review" },
        { value: "returned", label: "Returned" },
        { value: "rejected", label: "Rejected" },
        { value: "provisional", label: "Provisionally approved" },
        { value: "approved", label: "Approved" },
      ]),
      validationStatuses: withAll("statuses", [
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
        { value: "pending", label: "Pending" },
      ]),
      // Reviewer assignment doesn't exist as its own concept yet (see
      // data-submissions.service.ts's getSubmissions() comment) - empty
      // until Phase 3 gives it a real backing source.
      reviewers: withAll("reviewers", []),
      readinessTiers: withAll("tiers", []),
      overdueStatuses: withAll("statuses", [
        { value: "overdue", label: "Overdue" },
        { value: "due-soon", label: "Due soon" },
      ]),
    };
  }

  async getDatasets() {
    const datasets = await this.prisma.dataset.findMany({
      where: { isActive: true },
      include: DATASET_INCLUDE,
      orderBy: { name: "asc" },
    });
    return datasets.map(toDatasetView);
  }

  async getObligations(user: AuthenticatedUser, query: DataSubmissionsQueryDto) {
    const pageSize = Math.min(100, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const search = query.search?.trim().toLowerCase() ?? "";

    // A fulfilled obligation (accepted submission) never appears here - it
    // lives in submission history instead. Confirmed against the mock's
    // own comment on this exact behavior.
    const obligations = await this.prisma.obligation.findMany({
      where: {
        acceptedSubmissionId: null,
        ...scopeInstitutionFilter(user),
        ...(query.institution && query.institution !== "all" ? { institutionId: query.institution } : {}),
        ...(query.dataset && query.dataset !== "all" ? { datasetId: query.dataset } : {}),
        ...(query.reportingPeriod && query.reportingPeriod !== "all"
          ? { reportingPeriod: query.reportingPeriod }
          : {}),
      },
      include: OBLIGATION_INCLUDE,
      orderBy: { dueDate: "asc" },
    });

    // One query for the latest submission per obligation, rather than N+1 -
    // ordered so the first match per obligationId (via a Map) is the newest.
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

    const views = obligations
      .map((o) => toObligationView(o, latestByObligation.get(o.id) ?? null))
      .filter(
        (view) =>
          !search ||
          [view.institution, view.dataset, view.focalPerson].join(" ").toLowerCase().includes(search),
      );

    const stats = buildObligationStats(views);
    const page = paginate(views, query.page ?? 1, pageSize);
    return { ...page, stats };
  }

  async getSubmissions(user: AuthenticatedUser, query: DataSubmissionsQueryDto) {
    const pageSize = Math.min(100, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const search = query.search?.trim().toLowerCase() ?? "";

    const submissions = await this.prisma.submission.findMany({
      where: {
        ...scopeInstitutionFilter(user),
        ...(query.institution && query.institution !== "all" ? { institutionId: query.institution } : {}),
      },
      include: SUBMISSION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    const views = submissions
      .map(toSubmissionListItem)
      .filter((view) => !search || [view.institution, view.dataset].join(" ").toLowerCase().includes(search));

    return paginate(views, query.page ?? 1, pageSize);
  }

  async getOverdue(user: AuthenticatedUser, query: DataSubmissionsQueryDto) {
    const pageSize = Math.min(100, query.pageSize ?? DEFAULT_PAGE_SIZE);

    const overdue = await this.prisma.obligation.findMany({
      where: {
        acceptedSubmissionId: null,
        dueDate: { lt: new Date() },
        ...scopeInstitutionFilter(user),
        ...(query.institution && query.institution !== "all" ? { institutionId: query.institution } : {}),
      },
      include: OBLIGATION_INCLUDE,
      orderBy: { dueDate: "asc" },
    });

    const views = overdue.map(toOverdueItem);
    return paginate(views, query.page ?? 1, pageSize);
  }

  /**
   * Simplest defensible definition given what's actually computable today
   * (see toDataGap()'s comment): a KPI that has never had a single
   * approved value published for it. dataGapListSchema in the real
   * contract IS the paginated envelope (verified directly against
   * m300-frontend/src/api/schemas/data-submissions/compliance.ts - it
   * wraps pageOf(dataGapSchema) in a z.preprocess, easy to misread as a
   * plain array from the shape alone), not a bare array.
   */
  async getGaps(query: DataSubmissionsQueryDto) {
    const pageSize = Math.min(100, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const kpis = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true, values: { none: {} } },
      include: { pillar: true },
      orderBy: { name: "asc" },
    });
    return paginate(kpis.map(toDataGap), query.page ?? 1, pageSize);
  }

  async getManualEntryDefinition(obligationId: string) {
    const obligation = await this.findObligationWithFields(obligationId);
    return toManualEntryDefinition(obligation);
  }

  async getUploadDefinition(obligationId: string) {
    const obligation = await this.findObligationWithFields(obligationId);
    return toUploadDefinition(obligation);
  }

  /**
   * Mirrors the mock's own handler exactly (m300-frontend/src/mocks/
   * handlers/data-submissions.ts): it doesn't validate or compute
   * anything either, just records the draft and points back at the
   * submissions list, not the validation queue - "Server validation is
   * ready to run" implies that happens as a later step, unlike upload
   * (below), which validates synchronously and goes straight to
   * pending-review. This IS a real gap in the frontend's own contract
   * (no endpoint anywhere promotes a manual-entry draft to pending-
   * review) - matched deliberately rather than invented around.
   */
  async saveManualEntry(user: AuthenticatedUser, obligationId: string, dto: ManualEntryDto) {
    const obligation = await this.findObligationWithFields(obligationId);
    const items = buildSubmissionItems(obligation.dataset.fields, dto.values, obligation.reportingPeriod);

    const submission = await this.prisma.submission.create({
      data: {
        institutionId: obligation.institutionId,
        submittedById: user.id,
        method: "MANUAL_ENTRY",
        status: "DRAFT",
        obligationId: obligation.id,
        sourceReference: dto.sourceReference ?? "",
        notes: dto.notes ?? "",
        items: { create: items },
      },
    });

    return {
      submissionId: submission.id,
      version: submission.version,
      status: workflowStatus("draft"),
      message: "Draft saved. Server validation is ready to run.",
      nextUrl: "/data-submissions/submissions",
    };
  }

  /**
   * Real contract requirement (docs/API.md): parsing, field validation and
   * value extraction are backend responsibility, not the frontend's - the
   * mock's own upload handler only fabricates a fixed response, this does
   * the real work. Rejects outright (400) on a validation failure rather
   * than accepting-with-issues, since there's nowhere to persist/display
   * per-submission issues until Phase 3 builds the validation detail view.
   */
  async uploadSubmission(
    user: AuthenticatedUser,
    obligationId: string,
    file: Express.Multer.File | undefined,
    dto: { sourceReference?: string; notes?: string },
  ) {
    const obligation = await this.findObligationWithFields(obligationId);

    if (!file) throw new BadRequestException("Select a completed template to upload.");
    const sourceReference = dto.sourceReference?.trim();
    if (!sourceReference) throw new BadRequestException("Provide the source reference for this submission.");

    let values: Record<string, string>;
    try {
      values = await parseSubmissionFile(file.buffer, file.originalname, obligation.dataset.fields);
    } catch {
      throw new BadRequestException("Could not read the uploaded file - use the provided template.");
    }

    const issues = validateFieldValues(obligation.dataset.fields, values);
    if (issues.length > 0) {
      throw new BadRequestException(
        `The uploaded file has ${issues.length} problem${issues.length === 1 ? "" : "s"}: ` +
          issues.map((issue) => issue.message).join(" "),
      );
    }

    const items = buildSubmissionItems(obligation.dataset.fields, values, obligation.reportingPeriod);
    const stored = await this.storage.save("submissions", file);

    const submission = await this.prisma.submission.create({
      data: {
        institutionId: obligation.institutionId,
        submittedById: user.id,
        method: "UPLOAD",
        status: "PENDING",
        obligationId: obligation.id,
        sourceReference,
        notes: dto.notes ?? "",
        sourceFileUrl: stored.key,
        items: { create: items },
      },
    });

    return {
      submissionId: submission.id,
      version: submission.version,
      status: workflowStatus("pending-review"),
      message: "Upload received. Backend validation passed and the submission is ready for review.",
      nextUrl: `/data-submissions/validation/${submission.id}`,
    };
  }

  async getTemplate(fileName: string): Promise<Buffer> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { templateFileName: fileName },
      include: { fields: true },
    });
    if (!dataset) throw new NotFoundException("Template not found.");
    return generateTemplateBuffer(dataset.fields);
  }

  private async findObligationWithFields(obligationId: string) {
    const obligation = await this.prisma.obligation.findUnique({
      where: { id: obligationId },
      include: OBLIGATION_WITH_FIELDS_INCLUDE,
    });
    if (!obligation) throw new NotFoundException("The reporting obligation was not found.");
    return obligation;
  }
}

function buildObligationStats(views: ReturnType<typeof toObligationView>[]) {
  const byStatus = new Map<string, { code: string; label: string; tone: string; count: number }>();
  for (const view of views) {
    const existing = byStatus.get(view.status.code);
    if (existing) existing.count += 1;
    else byStatus.set(view.status.code, { ...view.status, count: 1 });
  }
  const overdueViews = views.filter((v) => v.status.code === "overdue");
  const averageDaysOverdue = overdueViews.length
    ? Math.round(
        overdueViews.reduce((sum, v) => sum + Math.abs(daysUntil(v.dueDate)), 0) / overdueViews.length,
      )
    : null;

  return {
    total: views.length,
    byStatus: [...byStatus.values()],
    overdueCount: overdueViews.length,
    averageDaysOverdue,
    openCount: views.length,
  };
}

function daysUntil(isoDate: string): number {
  return Math.round((new Date(isoDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
