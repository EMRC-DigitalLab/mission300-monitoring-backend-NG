import { Injectable, NotFoundException } from "@nestjs/common";
import { ReportType, ValidationStatus, KpiReadinessTier, type Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RabbitmqService } from "@/events/rabbitmq.service";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { toKebabCase } from "@/common/utils/enum-casing";
import { toCatalogueRow, toKpiProfile } from "@/modules/kpi-explorer/kpi-explorer.mappers";
import { toObligationView, toValidationQueueItem } from "@/modules/data-submissions/data-submissions.mappers";
import type { AuthenticatedUser } from "@/common/decorators/current-user.decorator";
import {
  appliedFiltersFor,
  buildCompactExportCards,
  buildReportCatalogue,
  configSignature,
  matchesPillars,
  periodsLabel,
  trailingPeriodLabels,
  validationStatusLabelFor,
  type ReportConfigLike,
  type ReportFilterOptions,
} from "@/modules/reports/reports.mappers";
import type { ReportConfigDto } from "@/modules/reports/dto/report-config.dto";
import type { ReportsQueryDto } from "@/modules/reports/dto/reports-query.dto";

const DEFAULT_PAGE_SIZE = 10;

const KPI_PROFILE_INCLUDE = { pillar: true, targetPoints: true } as const;
const VALUE_INCLUDE = { sourceSubmissionItem: { include: { submission: true } } } as const;
const OBLIGATION_INCLUDE = {
  institution: true,
  dataset: { include: { pillar: true, ownerInstitution: true } },
  focalPerson: true,
} as const;
const SUBMISSION_QUEUE_INCLUDE = {
  institution: true,
  submittedBy: true,
  obligation: { include: { dataset: true } },
  reviewer: true,
} as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  private async loadFilterOptions(): Promise<ReportFilterOptions> {
    const [periods, pillars, categories, states, discos, programmes] = await Promise.all([
      this.prisma.kpiValue.findMany({ select: { period: true }, distinct: ["period"] }),
      this.prisma.pillar.findMany({ orderBy: { name: "asc" } }),
      this.prisma.kpiDefinition.findMany({
        where: { category: { not: "" } },
        select: { category: true },
        distinct: ["category"],
      }),
      this.prisma.state.findMany({ orderBy: { name: "asc" } }),
      this.prisma.institution.findMany({ where: { type: "Disco" }, orderBy: { name: "asc" } }),
      this.prisma.programme.findMany({ orderBy: { name: "asc" } }),
    ]);

    const withAll = (label: string, options: { value: string; label: string }[]) => [
      { value: "all", label: `All ${label}` },
      ...options,
    ];

    return {
      reportingPeriods: withAll(
        "periods",
        [...new Set(periods.map((p) => p.period))].sort().map((p) => ({ value: p, label: p })),
      ),
      pillars: withAll(
        "pillars",
        pillars.map((p) => ({ value: p.slug, label: p.name })),
      ),
      kpiCategories: withAll(
        "categories",
        categories
          .map((c) => ({ value: c.category, label: c.category }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ),
      states: withAll(
        "states",
        states.map((s) => ({ value: s.id, label: s.name })),
      ),
      distributionCompanies: withAll(
        "Distribution Companies",
        discos.map((d) => ({ value: d.id, label: d.name })),
      ),
      programmesOrAgencies: withAll(
        "programmes",
        programmes.map((p) => ({ value: p.id, label: p.name })),
      ),
      validationStatuses: withAll(
        "validation statuses",
        Object.values(ValidationStatus).map((s) => ({
          value: toKebabCase(s),
          label: titleCase(toKebabCase(s)),
        })),
      ),
      readinessTiers: withAll(
        "readiness tiers",
        Object.values(KpiReadinessTier).map((t) => ({
          value: toKebabCase(t),
          label: titleCase(toKebabCase(t)),
        })),
      ),
    };
  }

  async getFilters() {
    const options = await this.loadFilterOptions();
    const catalogue = buildReportCatalogue();
    return {
      reportTypes: [
        { value: "all", label: "All report types" },
        ...catalogue.map((c) => ({ value: c.reportType, label: c.title })),
      ],
      reportingPeriods: options.reportingPeriods,
      pillars: options.pillars,
      kpiCategories: options.kpiCategories,
      states: options.states,
      distributionCompanies: options.distributionCompanies,
      programmesOrAgencies: options.programmesOrAgencies,
      validationStatuses: options.validationStatuses,
      readinessTiers: options.readinessTiers,
      exportFormats: [
        { value: "pdf", label: "PDF" },
        { value: "xlsx", label: "Excel (.xlsx)" },
      ],
    };
  }

  async getOverview(query: ReportsQueryDto) {
    const search = query.search?.trim().toLowerCase() ?? "";
    const category = query.category ?? "all";
    const page = query.page ?? 1;
    const pageSize = Math.min(50, query.pageSize ?? DEFAULT_PAGE_SIZE);

    const saved = await this.prisma.savedReport.findMany({
      include: { requestedBy: true },
      orderBy: { createdAt: "desc" },
    });

    const filtered = saved.filter((r) => {
      const matchesSearch =
        !search ||
        [r.title, r.requestedBy.fullName, r.fileReference].some((f) => f.toLowerCase().includes(search));
      const matchesCategory = category === "all" || REPORT_TYPE_CATEGORY_OF(r.reportType) === category;
      return matchesSearch && matchesCategory;
    });

    const { items, ...pageMeta } = paginate(filtered, page, pageSize);

    return {
      lastUpdated: new Date().toISOString(),
      catalogue: buildReportCatalogue(),
      compactExports: buildCompactExportCards(),
      savedReports: { items: items.map(toSavedReportResponse), ...pageMeta },
    };
  }

  async preview(dto: ReportConfigDto) {
    const options = await this.loadFilterOptions();
    return this.buildPreview(dto, options);
  }

  async generate(user: AuthenticatedUser, dto: ReportConfigDto) {
    const options = await this.loadFilterOptions();
    const preview = await this.buildPreview(dto, options);

    const catalogueEntry = buildReportCatalogue().find((c) => c.reportType === toKebabCase(dto.reportType))!;
    const signature = configSignature({ ...dto, reportType: dto.reportType });
    const filtersSummary = appliedFiltersFor(dto, options)
      .map((f) => f.value)
      .join(" · ");
    const fileReference = `${toKebabCase(dto.reportType)}_${dto.periods.join("-")}.${toKebabCase(dto.format)}`;
    // The stored/returned config must match reportConfigSchema's own wire
    // format (kebab-case) exactly, not this backend's internal Prisma enum
    // representation (SCREAMING_SNAKE_CASE) - a caller regenerating from a
    // saved report's own `config` would otherwise round-trip a value the
    // real schema rejects.
    const wireConfig = { ...dto, reportType: toKebabCase(dto.reportType), format: toKebabCase(dto.format) };

    const existing = await this.prisma.savedReport.findFirst({ where: { configSignature: signature } });

    const saved = existing
      ? await this.prisma.savedReport.update({
          where: { id: existing.id },
          data: {
            version: { increment: 1 },
            format: dto.format,
            filtersSummary,
            validationStatusLabel: validationStatusLabelFor(dto, options),
            fileReference,
            config: wireConfig as unknown as Prisma.InputJsonValue,
            lastGeneratedAt: new Date(),
          },
          include: { requestedBy: true },
        })
      : await this.prisma.savedReport.create({
          data: {
            requestedById: user.id,
            reportType: dto.reportType,
            title: `${catalogueEntry.title} — ${periodsLabel(dto, options)}`,
            filtersSummary,
            validationStatusLabel: validationStatusLabelFor(dto, options),
            version: 1,
            format: dto.format,
            fileReference,
            configSignature: signature,
            config: wireConfig as unknown as Prisma.InputJsonValue,
          },
          include: { requestedBy: true },
        });

    // Synchronous - there is no async generation step to wait for (the
    // backend never renders a file; see this module's own header comment).
    // Still fired so the existing "report ready" email/webhook feature
    // keeps working, just without the delay it was originally built to
    // announce the end of.
    await this.rabbitmq.publish("report.ready", { reportId: saved.id });

    return { preview, savedReport: toSavedReportResponse(saved) };
  }

  async deleteSaved(id: string) {
    const existing = await this.prisma.savedReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No saved report found with id ${id}`);
    await this.prisma.savedReport.delete({ where: { id } });
  }

  /** GET /api/reports/methodology - every tracked KPI's definition and calculation methodology, independent of any report configuration. */
  async getMethodology() {
    const kpis = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true },
      include: { pillar: true },
      orderBy: { code: "asc" },
    });

    const rows = kpis.map((kpi) => [
      kpi.code,
      kpi.name,
      kpi.pillar.slug,
      kpi.definition || "Not yet documented.",
      kpi.formula || "Not yet documented.",
      kpi.sourceInstitution || "Not supplied",
    ]);

    return {
      metadata: {
        title: "KPI methodology export — all tracked indicators",
        reportingPeriod: "Not period-specific — methodology, not values",
        appliedFilters: [] as { label: string; value: string }[],
        generatedAt: new Date().toISOString(),
        dataVersion: `M300 live database, ${new Date().toISOString().slice(0, 10)}`,
        sourceNotes: "Master KPI Registry — definition and calculation methodology per indicator.",
        validationStatus: "Not applicable — methodology text, not a validated figure.",
        units: "Not applicable.",
        limitations: "Generated from the M300 platform's live database.",
      },
      sections: [
        {
          title: "Indicator methodologies",
          columns: ["ID", "Indicator", "Pillar", "Definition", "Methodology", "Source institution"],
          rows,
        },
      ],
    };
  }

  private async buildPreview(
    config: ReportConfigLike & { reportType: ReportType },
    options: ReportFilterOptions,
  ) {
    const catalogueEntry = buildReportCatalogue().find(
      (c) => c.reportType === toKebabCase(config.reportType),
    )!;
    const now = new Date().toISOString();

    return {
      metadata: {
        title: `${catalogueEntry.title} — ${periodsLabel(config, options)}`,
        reportingPeriod: periodsLabel(config, options),
        appliedFilters: appliedFiltersFor(config, options),
        generatedAt: now,
        dataVersion: `M300 live database, ${now.slice(0, 10)}`,
        sourceNotes: catalogueEntry.dataSource,
        validationStatus: validationStatusLabelFor(config, options),
        units: "As recorded per indicator; see indicator metadata for unit definitions.",
        limitations:
          "Generated from the M300 platform's live database. Verify against the approved Compact Progress Report before external distribution.",
      },
      sections: await this.sectionsFor(config.reportType, config),
    };
  }

  private async sectionsFor(reportType: ReportType, config: ReportConfigLike) {
    switch (reportType) {
      case "COMPACT_PROGRESS":
      case "COMPACT_REVIEW":
        return [
          ...(await this.deliverySection(config)),
          await this.bottleneckSection(config),
          await this.lessonsLearnedSection(config),
        ];
      case "PILLAR_PERFORMANCE":
      case "KPI_INDICATOR":
        return [await this.kpiSection(config, "Indicators", reportType)];
      case "STATE_DISCO":
        return [await this.stateDiscoSection(config), ...(await this.deliverySection(config))];
      case "IMPLEMENTATION":
        return this.deliverySection(config);
      case "BOTTLENECK":
        return [await this.bottleneckSection(config), await this.lessonsLearnedSection(config)];
      case "FINANCIAL":
        return [await this.financialSection(config)];
      case "SUBMISSION_COMPLIANCE":
        return [await this.complianceSection()];
      case "DATA_QUALITY":
        return [await this.dataQualitySection()];
    }
  }

  private async kpiSection(config: ReportConfigLike, title: string, reportType: ReportType) {
    const kpis = await this.prisma.kpiDefinition.findMany({
      where: { isActive: true },
      include: KPI_PROFILE_INCLUDE,
    });
    const values = await this.prisma.kpiValue.findMany({
      where: { kpiDefinitionId: { in: kpis.map((k) => k.id) } },
      include: VALUE_INCLUDE,
      orderBy: { approvedAt: "desc" },
    });

    const latestByKpi = new Map<string, (typeof values)[number]>();
    const valuesByKpi = new Map<string, typeof values>();
    for (const v of values) {
      if (!latestByKpi.has(v.kpiDefinitionId)) latestByKpi.set(v.kpiDefinitionId, v);
      const list = valuesByKpi.get(v.kpiDefinitionId) ?? [];
      list.push(v);
      valuesByKpi.set(v.kpiDefinitionId, list);
    }

    const rows2 = kpis
      .map((kpi) => ({ kpi, row: toCatalogueRow(kpi, latestByKpi.get(kpi.id) ?? null) }))
      .filter(
        ({ row }) =>
          matchesPillars(config, row.pillar) &&
          (config.kpiCategory === "all" || row.category === config.kpiCategory) &&
          (config.validationStatus === "all" || row.validationStatus === config.validationStatus) &&
          (config.readinessTier === "all" || row.readiness === config.readinessTier),
      );

    const isComparable =
      config.periods.length > 1 && (reportType === "KPI_INDICATOR" || reportType === "PILLAR_PERFORMANCE");
    const periodLabels = isComparable ? trailingPeriodLabels(config.periods.length) : [];

    const rows = rows2.map(({ kpi, row }) => {
      const profile = toKpiProfile(
        { ...kpi, pillar: kpi.pillar, targetPoints: kpi.targetPoints },
        (valuesByKpi.get(kpi.id) ?? []) as never,
      );
      const cells = [
        row.id,
        row.name,
        row.pillar,
        row.category,
        row.unit,
        profile.baseline !== null ? String(profile.baseline) : "—",
        profile.current !== null ? String(profile.current) : "—",
        profile.target !== null ? String(profile.target) : "—",
        row.validationStatus,
      ];
      if (isComparable) {
        const trailing = profile.history.slice(-periodLabels.length);
        const padding = periodLabels.length - trailing.length;
        cells.push(...Array(padding).fill("—"), ...trailing.map((p) => String(p.value)));
      }
      return cells;
    });

    return {
      title,
      columns: [
        "ID",
        "Indicator",
        "Pillar",
        "Category",
        "Unit",
        "Baseline",
        "Current",
        "Target",
        "Validation status",
        ...periodLabels,
      ],
      rows,
    };
  }

  private async deliverySection(config: ReportConfigLike) {
    const [programmes, projects] = await Promise.all([
      this.prisma.programme.findMany({ include: { pillar: true } }),
      this.prisma.project.findMany({ include: { pillar: true } }),
    ]);

    const filteredProgrammes = programmes.filter(
      (p) =>
        matchesPillars(config, p.pillar.slug) &&
        (config.programmeOrAgency === "all" || p.id === config.programmeOrAgency),
    );
    const filteredProjects = projects.filter(
      (p) =>
        matchesPillars(config, p.pillar.slug) &&
        (config.programmeOrAgency === "all" || p.programmeId === config.programmeOrAgency),
    );

    return [
      {
        title: "Programmes",
        columns: ["ID", "Name", "Lead institution", "Pillar", "Status"],
        rows: filteredProgrammes.map((p) => [
          p.id,
          p.name,
          p.leadInstitution,
          p.pillar.slug,
          toKebabCase(p.status),
        ]),
      },
      {
        title: "Projects",
        columns: ["ID", "Name", "Pillar", "Status"],
        rows: filteredProjects.map((p) => [p.id, p.name, p.pillar.slug, toKebabCase(p.currentStatus)]),
      },
    ];
  }

  private async bottleneckSection(config: ReportConfigLike) {
    const now = new Date();
    const rows = await this.prisma.bottleneck.findMany({ include: { pillar: true } });
    return {
      title: "Bottlenecks",
      columns: ["ID", "Issue", "Category", "Severity", "Status", "Age (days)"],
      rows: rows
        .filter((b) => matchesPillars(config, b.pillar.slug))
        .map((b) => [
          b.id,
          b.issue,
          toKebabCase(b.category),
          toKebabCase(b.severity),
          toKebabCase(b.status),
          String(Math.floor((now.getTime() - b.dateRaised.getTime()) / (24 * 60 * 60 * 1000))),
        ]),
    };
  }

  private async lessonsLearnedSection(config: ReportConfigLike) {
    const rows = await this.prisma.bottleneck.findMany({ include: { pillar: true } });
    return {
      title: "Lessons learned and follow-up actions",
      columns: ["ID", "Issue", "Status", "Follow-up / lesson learned"],
      rows: rows
        .filter((b) => matchesPillars(config, b.pillar.slug) && b.followUp.trim().length > 0)
        .map((b) => [b.id, b.issue, toKebabCase(b.status), b.followUp]),
    };
  }

  private async stateDiscoSection(config: ReportConfigLike) {
    const states = await this.prisma.state.findMany({ orderBy: { name: "asc" } });
    return {
      title: "State coverage",
      columns: ["ID", "State", "Zone"],
      rows: states
        .filter((s) => config.state === "all" || s.id === config.state)
        .map((s) => [s.id, s.name, s.zone]),
    };
  }

  private async financialSection(config: ReportConfigLike) {
    const programmes = await this.prisma.programme.findMany({ include: { pillar: true } });
    return {
      title: "Programme financing",
      columns: ["ID", "Name", "Financing", "Status"],
      rows: programmes
        .filter((p) => matchesPillars(config, p.pillar.slug))
        .map((p) => [p.id, p.name, p.financing ?? "Held at project level", toKebabCase(p.status)]),
    };
  }

  private async complianceSection() {
    const obligations = await this.prisma.obligation.findMany({ include: OBLIGATION_INCLUDE });
    const submissions = await this.prisma.submission.findMany({
      where: { obligationId: { in: obligations.map((o) => o.id) } },
      orderBy: { createdAt: "desc" },
    });
    const latestBySubmission = new Map<string, (typeof submissions)[number]>();
    for (const s of submissions) {
      if (s.obligationId && !latestBySubmission.has(s.obligationId))
        latestBySubmission.set(s.obligationId, s);
    }

    const rows = obligations.map((o) => {
      const view = toObligationView(o, latestBySubmission.get(o.id) ?? null);
      return [view.id, view.institution, view.dataset, view.reportingPeriod, view.status.label];
    });

    return {
      title: "Submission obligations",
      columns: ["ID", "Institution", "Dataset", "Reporting period", "Status"],
      rows,
    };
  }

  private async dataQualitySection() {
    const submissions = await this.prisma.submission.findMany({
      where: { status: "PENDING" },
      include: SUBMISSION_QUEUE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const rows = submissions.map((s) => {
      const item = toValidationQueueItem(s);
      return [item.id, item.institution, item.dataset, item.status.label];
    });

    return {
      title: "Validation queue",
      columns: ["ID", "Institution", "Dataset", "Status"],
      rows,
    };
  }
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function REPORT_TYPE_CATEGORY_OF(reportType: ReportType): string {
  const category: Record<ReportType, string> = {
    COMPACT_PROGRESS: "compact",
    COMPACT_REVIEW: "compact",
    PILLAR_PERFORMANCE: "performance",
    KPI_INDICATOR: "performance",
    STATE_DISCO: "delivery",
    IMPLEMENTATION: "delivery",
    BOTTLENECK: "delivery",
    FINANCIAL: "delivery",
    SUBMISSION_COMPLIANCE: "data-governance",
    DATA_QUALITY: "data-governance",
  };
  return category[reportType];
}

function toSavedReportResponse(report: Prisma.SavedReportGetPayload<{ include: { requestedBy: true } }>) {
  return {
    id: report.id,
    reportType: toKebabCase(report.reportType),
    category: REPORT_TYPE_CATEGORY_OF(report.reportType),
    title: report.title,
    owner: report.requestedBy.fullName,
    filtersSummary: report.filtersSummary,
    validationStatusLabel: report.validationStatusLabel,
    version: report.version,
    format: toKebabCase(report.format),
    fileReference: report.fileReference,
    createdAt: report.createdAt.toISOString(),
    lastGeneratedAt: report.lastGeneratedAt.toISOString(),
    config: report.config,
  };
}
