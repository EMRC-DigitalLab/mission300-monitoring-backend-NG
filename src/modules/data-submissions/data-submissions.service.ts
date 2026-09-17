import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ReviewDecisionType, SubmissionStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { StorageService } from "@/storage/storage.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { SecuritySettingsService } from "@/modules/administration/security/security-settings.service";
import { scopeInstitutionFilter } from "@/common/guards/institution-scope.guard";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { workflowStatus } from "@/modules/data-submissions/workflow-status";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { DataSubmissionsQueryDto } from "@/modules/data-submissions/dto/data-submissions-query.dto";
import type { ManualEntryDto } from "@/modules/data-submissions/dto/manual-entry.dto";
import type { RecordValidationDecisionDto } from "@/modules/data-submissions/dto/record-validation-decision.dto";
import {
  toDataGap,
  toDatasetView,
  toManualEntryDefinition,
  toObligationView,
  toOverdueItem,
  toSubmissionDetail,
  toSubmissionListItem,
  toUploadDefinition,
  toValidationQueueItem,
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
  reviewer: true,
} as const;
const SUBMISSION_DETAIL_INCLUDE = {
  institution: true,
  submittedBy: true,
  obligation: { include: { dataset: true } },
  reviewer: true,
  items: { include: { kpiDefinition: true } },
  reviewDecisions: { include: { reviewedBy: true } },
} as const;
const OBLIGATION_WITH_FIELDS_INCLUDE = {
  institution: true,
  dataset: { include: { fields: true } },
} as const;

// Maps the real contract's lower-kebab decision string to the internal
// Prisma types - both the ReviewDecision row's own enum and the
// Submission's resulting status.
const DECISION_TO_REVIEW_TYPE: Record<string, ReviewDecisionType> = {
  approved: "APPROVE",
  provisional: "PROVISIONALLY_APPROVE",
  returned: "RETURN_FOR_CORRECTION",
  rejected: "REJECT",
};
const DECISION_TO_STATUS: Record<string, SubmissionStatus> = {
  approved: "APPROVED",
  provisional: "PROVISIONALLY_APPROVED",
  returned: "RETURNED",
  rejected: "REJECTED",
};
const VALUE_PUBLISHING_DECISIONS = new Set(["approved", "provisional"]);

@Injectable()
export class DataSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly rabbitmq: RabbitmqService,
    private readonly securitySettings: SecuritySettingsService,
  ) {}

  async getFilters() {
    const [institutions, datasets, obligationPeriods, reviewerUsers] = await Promise.all([
      this.prisma.institution.findMany({ orderBy: { name: "asc" } }),
      this.prisma.dataset.findMany({ orderBy: { name: "asc" } }),
      this.prisma.obligation.findMany({ select: { reportingPeriod: true }, distinct: ["reportingPeriod"] }),
      this.prisma.user.findMany({
        where: { OR: [{ role: { in: ["DATA_REVIEWER", "VALIDATOR"] } }, { roles: { hasSome: ["DATA_REVIEWER", "VALIDATOR"] } }], status: "ACTIVE" },
        orderBy: { fullName: "asc" },
      }),
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
      reviewers: withAll(
        "reviewers",
        reviewerUsers.map((reviewer) => ({ value: reviewer.id, label: reviewer.fullName })),
      ),
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

  async saveManualEntry(user: AuthenticatedUser, obligationId: string, dto: ManualEntryDto) {
    const obligation = await this.findObligationWithFields(obligationId);
    this.assertInstitutionAccess(user, obligation.institutionId);

    const issues = validateFieldValues(obligation.dataset.fields, dto.values);
    if (issues.length > 0) {
      throw new BadRequestException(
        `This entry has ${issues.length} problem${issues.length === 1 ? "" : "s"}: ` +
          issues.map((issue) => issue.message).join(" "),
      );
    }

    const items = buildSubmissionItems(obligation.dataset.fields, dto.values, obligation.reportingPeriod);
    const reviewerId = await this.pickReviewer(user.id);

    const submission = await this.prisma.submission.create({
      data: {
        institutionId: obligation.institutionId,
        submittedById: user.id,
        method: "MANUAL_ENTRY",
        status: "PENDING",
        obligationId: obligation.id,
        sourceReference: dto.sourceReference ?? "",
        notes: dto.notes ?? "",
        reviewerId,
        items: { create: items },
      },
    });

    await this.rabbitmq.publish("submission.uploaded", { submissionId: submission.id });

    return {
      submissionId: submission.id,
      version: submission.version,
      status: workflowStatus("pending-review"),
      message: "Entry submitted. Backend validation passed and the submission is ready for review.",
      nextUrl: `/data-submissions/validation/${submission.id}`,
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
    this.assertInstitutionAccess(user, obligation.institutionId);

    if (!file) throw new BadRequestException("Select a completed template to upload.");
    const sourceReference = dto.sourceReference?.trim();
    if (!sourceReference) throw new BadRequestException("Provide the source reference for this submission.");

    let rows: { period: string; values: Record<string, string> }[];
    try {
      rows = await parseSubmissionFile(file.buffer, file.originalname, obligation.dataset.fields);
    } catch {
      throw new BadRequestException("Could not read the uploaded file - use the provided template.");
    }
    if (rows.length === 0) {
      throw new BadRequestException("The uploaded file has no data rows to submit.");
    }

    const resolved: { period: string; values: Record<string, string>; obligationId: string; institutionId: string }[] = [];
    const unmatchedPeriods: string[] = [];
    for (const row of rows) {
      if (!row.period) {
        throw new BadRequestException("Every row must have a Period value.");
      }
      if (row.period === obligation.reportingPeriod) {
        resolved.push({ ...row, obligationId: obligation.id, institutionId: obligation.institutionId });
        continue;
      }
      const matching = await this.prisma.obligation.findUnique({
        where: {
          institutionId_datasetId_reportingPeriod: {
            institutionId: obligation.institutionId,
            datasetId: obligation.dataset.id,
            reportingPeriod: row.period,
          },
        },
      });
      if (!matching) {
        unmatchedPeriods.push(row.period);
        continue;
      }
      resolved.push({ ...row, obligationId: matching.id, institutionId: matching.institutionId });
    }

    if (resolved.length === 0) {
      throw new BadRequestException(
        `No row matched a known reporting obligation for this institution and dataset. Periods in the file: ${unmatchedPeriods.join(", ")}.`,
      );
    }

    for (const row of resolved) {
      const issues = validateFieldValues(obligation.dataset.fields, row.values);
      if (issues.length > 0) {
        throw new BadRequestException(
          `Row for ${row.period} has ${issues.length} problem${issues.length === 1 ? "" : "s"}: ` +
            issues.map((issue) => issue.message).join(" "),
        );
      }
    }

    const stored = await this.storage.save("submissions", file);
    const reviewerId = await this.pickReviewer(user.id);

    const created: { submissionId: string; version: number }[] = [];
    for (const row of resolved) {
      const items = buildSubmissionItems(obligation.dataset.fields, row.values, row.period);
      const submission = await this.prisma.submission.create({
        data: {
          institutionId: row.institutionId,
          submittedById: user.id,
          method: "UPLOAD",
          status: "PENDING",
          obligationId: row.obligationId,
          sourceReference,
          notes: dto.notes ?? "",
          sourceFileUrl: stored.key,
          originalFileName: stored.originalName,
          reviewerId,
          items: { create: items },
        },
      });
      await this.rabbitmq.publish("submission.uploaded", { submissionId: submission.id });
      created.push({ submissionId: submission.id, version: submission.version });
    }

    const primary = created.find((entry) => entry.submissionId) ?? created[0];
    const skippedNote =
      unmatchedPeriods.length > 0 ? ` ${unmatchedPeriods.length} row(s) were skipped (no matching obligation for: ${unmatchedPeriods.join(", ")}).` : "";

    return {
      submissionId: primary.submissionId,
      version: primary.version,
      status: workflowStatus("pending-review"),
      message:
        created.length === 1
          ? "Upload received. Backend validation passed and the submission is ready for review."
          : `Upload received. ${created.length} submissions were created from this file and are ready for review.${skippedNote}`,
      nextUrl:
        created.length === 1 ? `/data-submissions/validation/${primary.submissionId}` : "/data-submissions/validation",
    };
  }

  async getTemplate(fileName: string): Promise<Buffer> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { templateFileName: fileName },
      include: { fields: true },
    });
    if (!dataset) throw new NotFoundException("Template not found.");
    return generateTemplateBuffer(dataset.fields, dataset.frequency);
  }

  async getValidationQueue(user: AuthenticatedUser, query: DataSubmissionsQueryDto) {
    const pageSize = Math.min(100, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const search = query.search?.trim().toLowerCase() ?? "";

    const submissions = await this.prisma.submission.findMany({
      where: {
        status: "PENDING",
        ...scopeInstitutionFilter(user),
        ...(query.institution && query.institution !== "all" ? { institutionId: query.institution } : {}),
        ...(query.reviewer && query.reviewer !== "all" ? { reviewerId: query.reviewer } : {}),
      },
      include: SUBMISSION_INCLUDE,
      orderBy: { createdAt: "asc" }, // oldest-waiting first
    });

    const views = submissions
      .map(toValidationQueueItem)
      .filter(
        (view) =>
          !search || [view.institution, view.dataset, view.reviewer].join(" ").toLowerCase().includes(search),
      );

    return paginate(views, query.page ?? 1, pageSize);
  }

  async getSubmissionDetail(user: AuthenticatedUser, id: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id, ...scopeInstitutionFilter(user) },
      include: SUBMISSION_DETAIL_INCLUDE,
    });
    if (!submission) throw new NotFoundException("Submission not found.");
    return toSubmissionDetail(submission);
  }

  /**
   * The one place a review decision is written AND, if it's an approval,
   * the one place live KpiValues are derived from submitted data - both
   * in a single transaction, same invariant the old submissions module
   * already established. Also updates the obligation's
   * acceptedSubmissionId (docs/API.md: "should also update the
   * obligation's acceptedSubmissionId"), which the old module never had
   * to do because it predates the Obligation concept entirely.
   */
  async recordDecision(user: AuthenticatedUser, id: string, dto: RecordValidationDecisionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: { items: { include: { kpiDefinition: true } } },
    });
    if (!submission) throw new NotFoundException("Submission not found.");
    if (submission.submittedById === user.id && !(await this.securitySettings.get()).allowSelfReview) {
      throw new ForbiddenException("Self-review is disabled by the system administrator.");
    }
    if (submission.status !== "PENDING") {
      throw new BadRequestException("This submission is not awaiting a decision.");
    }

    const reviewType = DECISION_TO_REVIEW_TYPE[dto.decision];
    const targetStatus = DECISION_TO_STATUS[dto.decision];
    const publishesValue = VALUE_PUBLISHING_DECISIONS.has(dto.decision);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.submission.updateMany({
        where: { id, status: "PENDING" },
        data: { status: targetStatus },
      });
      if (count !== 1) {
        throw new BadRequestException("This submission was already decided.");
      }
      await tx.reviewDecision.create({
        data: { submissionId: id, reviewedById: user.id, decision: reviewType, comment: dto.comments },
      });

      if (publishesValue) {
        const approvedAt = new Date();
        for (const item of submission.items) {
          await tx.kpiValue.upsert({
            where: { sourceSubmissionItemId: item.id },
            create: {
              kpiDefinitionId: item.kpiDefinitionId,
              institutionId: submission.institutionId,
              period: item.period,
              value: item.value,
              sourceSubmissionItemId: item.id,
              approvedAt,
            },
            update: { value: item.value, approvedAt },
          });
        }
        if (submission.obligationId) {
          await tx.obligation.update({
            where: { id: submission.obligationId },
            data: { acceptedSubmissionId: id },
          });
        }
      }
    });

    await this.rabbitmq.publish("submission.decision_recorded", {
      submissionId: id,
      decision: reviewType,
      institutionId: submission.institutionId,
    });

    const published = publishesValue
      ? submission.items.map((item) => ({
          kpiId: item.kpiDefinitionId,
          kpiName: item.kpiDefinition.name,
          reportingPeriod: item.period,
          value: Number(item.value),
        }))
      : [];
    const status = workflowStatus(dto.decision);
    const message = published.length
      ? `Decision recorded: ${status.label}. Published to ${published.map((p) => p.kpiName).join(", ")}.`
      : `Decision recorded: ${status.label}.`;

    return {
      submissionId: id,
      status,
      message,
      nextUrl: "/data-submissions/validation",
      published,
    };
  }

  /**
   * Simple round-robin by current PENDING load - there's no explicit
   * "assign a reviewer" action anywhere in the real contract, so this
   * picks one at upload time rather than leaving every submission
   * unassigned. Returns null if no reviewer-capable account exists yet
   * (a fresh system before anyone with that role has been invited).
   */
  private async pickReviewer(submitterId: string): Promise<string | null> {
    const { allowSelfReview } = await this.securitySettings.get();
    const reviewers = await this.prisma.user.findMany({
      where: {
        OR: [{ role: { in: ["DATA_REVIEWER", "VALIDATOR"] } }, { roles: { hasSome: ["DATA_REVIEWER", "VALIDATOR"] } }],
        status: "ACTIVE",
        ...(allowSelfReview ? {} : { id: { not: submitterId } }),
      },
      include: { _count: { select: { reviewingSubmissions: { where: { status: "PENDING" } } } } },
    });
    if (reviewers.length === 0) return null;
    reviewers.sort((a, b) => a._count.reviewingSubmissions - b._count.reviewingSubmissions);
    return reviewers[0].id;
  }

  private assertInstitutionAccess(user: AuthenticatedUser, institutionId: string) {
    const filter = scopeInstitutionFilter(user);
    if (filter.institutionId && filter.institutionId !== institutionId) {
      throw new ForbiddenException("You cannot submit data for another institution's obligation.");
    }
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
