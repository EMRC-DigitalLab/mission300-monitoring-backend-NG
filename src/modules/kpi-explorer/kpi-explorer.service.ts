import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { paginate } from "@/modules/administration/overview/overview.mappers";
import { toKebabCase } from "@/common/utils/enum-casing";
import type { KpiExplorerQueryDto } from "@/modules/kpi-explorer/dto/kpi-explorer-query.dto";
import { toCatalogueRow, toKpiProfile } from "@/modules/kpi-explorer/kpi-explorer.mappers";

const DEFAULT_PAGE_SIZE = 20;

const VALUE_INCLUDE = { sourceSubmissionItem: { include: { submission: true } } } as const;
const KPI_INCLUDE = { pillar: true } as const;
const KPI_PROFILE_INCLUDE = { pillar: true, targetPoints: true } as const;

const READINESS_TIERS = ["CORE", "SUPPORTING", "FUTURE"] as const;
const VALIDATION_STATUSES = [
  "confirmed",
  "public-source",
  "requires-validation",
  "provisional",
  "future",
] as const;

@Injectable()
export class KpiExplorerService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [pillars, categories, sourceInstitutions, periods] = await Promise.all([
      this.prisma.pillar.findMany({ orderBy: { name: "asc" } }),
      this.prisma.kpiDefinition.findMany({
        where: { category: { not: "" } },
        select: { category: true },
        distinct: ["category"],
      }),
      this.prisma.kpiDefinition.findMany({
        where: { sourceInstitution: { not: "" } },
        select: { sourceInstitution: true },
        distinct: ["sourceInstitution"],
      }),
      this.prisma.kpiValue.findMany({ select: { period: true }, distinct: ["period"] }),
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
      categories: withAll(
        "categories",
        categories
          .map((c) => ({ value: c.category, label: c.category }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ),
      readinessTiers: withAll(
        "readiness tiers",
        READINESS_TIERS.map((tier) => ({ value: toKebabCase(tier), label: titleCase(toKebabCase(tier)) })),
      ),
      validationStatuses: withAll(
        "validation statuses",
        VALIDATION_STATUSES.map((status) => ({ value: status, label: titleCase(status) })),
      ),
      sourceInstitutions: withAll(
        "institutions",
        sourceInstitutions.map((s) => ({ value: s.sourceInstitution, label: s.sourceInstitution })),
      ),
      reportingPeriods: withAll(
        "periods",
        [...new Set(periods.map((p) => p.period))].sort().map((p) => ({ value: p, label: p })),
      ),
      // No State/DisCo entity exists yet - see this DTO's own comment.
      geographies: withAll("geographies", []),
    };
  }

  async getOverview(query: KpiExplorerQueryDto) {
    const pageSize = Math.min(200, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const search = query.search?.trim().toLowerCase() ?? "";

    const [allKpis, allValues] = await Promise.all([
      this.prisma.kpiDefinition.findMany({ where: { isActive: true }, include: KPI_INCLUDE }),
      this.prisma.kpiValue.findMany({ include: VALUE_INCLUDE, orderBy: { approvedAt: "desc" } }),
    ]);

    const latestByKpi = new Map<string, (typeof allValues)[number]>();
    for (const value of allValues) {
      if (!latestByKpi.has(value.kpiDefinitionId)) latestByKpi.set(value.kpiDefinitionId, value);
    }

    const allRows = allKpis.map((kpi) => ({
      kpi,
      row: toCatalogueRow(kpi, latestByKpi.get(kpi.id) ?? null),
    }));

    const filteredRows = allRows.filter(({ row }) => {
      if (query.pillar && query.pillar !== "all" && row.pillar !== query.pillar) return false;
      if (query.category && query.category !== "all" && row.category !== query.category) return false;
      if (query.readiness && query.readiness !== "all" && row.readiness !== query.readiness) return false;
      if (
        query.validationStatus &&
        query.validationStatus !== "all" &&
        row.validationStatus !== query.validationStatus
      ) {
        return false;
      }
      if (
        query.sourceInstitution &&
        query.sourceInstitution !== "all" &&
        row.sourceInstitution !== query.sourceInstitution
      ) {
        return false;
      }
      if (search && ![row.id, row.name, row.sourceInstitution].join(" ").toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    return {
      lastUpdated: new Date().toISOString(),
      summary: buildSummaryCards(allRows.map((r) => r.row)),
      catalogue: paginate(
        filteredRows.map((r) => r.row),
        query.page ?? 1,
        pageSize,
      ),
      pillarDistribution: buildPillarDistribution(allRows.map((r) => r.row)),
      readinessDistribution: buildReadinessDistribution(allRows.map((r) => r.row)),
    };
  }

  async getProfile(code: string) {
    const kpi = await this.prisma.kpiDefinition.findUnique({ where: { code }, include: KPI_PROFILE_INCLUDE });
    if (!kpi) throw new NotFoundException("KPI not found.");

    const values = await this.prisma.kpiValue.findMany({
      where: { kpiDefinitionId: kpi.id },
      include: VALUE_INCLUDE,
    });

    return toKpiProfile(kpi, values);
  }
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const PROVENANCE_NOW = () => new Date().toISOString();

/**
 * Matches catalogueSummaryCardSchema, exactly the 4 cards from docs/specs/
 * kpi-explorer.md Section A - computed against the full active catalogue,
 * never affected by the query's own filters (same "these are catalogue
 * summaries, not a filtered view" pattern as Administration's summary
 * cards).
 */
function buildSummaryCards(rows: ReturnType<typeof toCatalogueRow>[]) {
  const now = PROVENANCE_NOW();
  const provenance = (definition: string, methodology: string, source: string) => ({
    definition,
    methodology,
    source,
    lastUpdated: now,
  });

  const coreCount = rows.filter((r) => r.readiness === "core").length;
  const supportingCount = rows.filter((r) => r.readiness === "supporting").length;
  const withValue = rows.filter((r) => r.validationStatus !== "future").length;
  const dataGap = rows.length - withValue;

  return [
    {
      id: "total-indicators",
      title: "Total indicators",
      count: rows.length,
      breakdown: [] as { label: string; count: number }[],
      provenance: provenance(
        "Count of active indicators in the approved catalogue.",
        "Count unique active Key Performance Indicator identifiers.",
        "Approved Mission 300 Key Performance Indicator Matrix",
      ),
    },
    {
      id: "core-indicators",
      title: "Core or Tier 1 indicators",
      count: coreCount,
      breakdown: [],
      provenance: provenance(
        "Indicators classified as immediate Minimum Viable Dataset priorities.",
        "Count catalogue records classified Core or Tier 1.",
        "Approved Key Performance Indicator Matrix",
      ),
    },
    {
      id: "supporting-indicators",
      title: "Supporting or Tier 2 indicators",
      count: supportingCount,
      breakdown: [],
      provenance: provenance(
        "Supporting indicators to be used where the source institution already maintains the data.",
        "Count catalogue records classified Supporting or Tier 2.",
        "Approved Key Performance Indicator Matrix",
      ),
    },
    {
      id: "data-availability",
      title: "Indicators with a current value or data gap",
      count: rows.length,
      breakdown: [
        { label: "With current value", count: withValue },
        { label: "Data gap", count: dataGap },
      ],
      provenance: provenance(
        "Catalogue coverage by current data availability.",
        "Count indicators with an approved current value separately from those marked as a data gap.",
        "Key Performance Indicator value repository and validation workflow",
      ),
    },
  ];
}

function buildPillarDistribution(rows: ReturnType<typeof toCatalogueRow>[]) {
  const byPillar = new Map<string, ReturnType<typeof toCatalogueRow>[]>();
  for (const row of rows) {
    if (!byPillar.has(row.pillar)) byPillar.set(row.pillar, []);
    byPillar.get(row.pillar)!.push(row);
  }
  return [...byPillar.entries()].map(([pillar, pillarRows]) => {
    const statusCounts = new Map<string, number>();
    for (const row of pillarRows) {
      statusCounts.set(row.validationStatus, (statusCounts.get(row.validationStatus) ?? 0) + 1);
    }
    return {
      pillar,
      label: titleCase(pillar),
      total: pillarRows.length,
      byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    };
  });
}

function buildReadinessDistribution(rows: ReturnType<typeof toCatalogueRow>[]) {
  return READINESS_TIERS.map((tier) => {
    const code = toKebabCase(tier);
    return { tier: code, label: titleCase(code), count: rows.filter((r) => r.readiness === code).length };
  });
}
