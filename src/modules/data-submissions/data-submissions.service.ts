import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { scopeInstitutionFilter } from "@/common/guards/institution-scope.guard";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import type { DataSubmissionsQueryDto } from "@/modules/data-submissions/dto/data-submissions-query.dto";
import {
  toDataGap,
  toDatasetView,
  toObligationView,
  toOverdueItem,
  toSubmissionListItem,
} from "@/modules/data-submissions/data-submissions.mappers";

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

@Injectable()
export class DataSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

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
   * approved value published for it. Not paginated in the mock's own
   * shape either (dataGapListSchema is a plain array) - kept that way here.
   */
  async getGaps() {
    const kpis = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true, values: { none: {} } },
      include: { pillar: true },
      orderBy: { name: "asc" },
    });
    return kpis.map(toDataGap);
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
