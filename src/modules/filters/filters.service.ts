import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { formatPeriodLabel } from "@/modules/kpi-explorer/kpi-explorer.mappers";

// Matches dashboardFilterOptionsSchema (m300-frontend/src/api/schemas/
// filters.ts) exactly - the application-wide filter bar in the shell, not
// scoped to any one module. Distinct from every other module's own
// `GET .../filters` (programs, bottlenecks, kpi-explorer, etc.) - those
// answer that module's own filter set; this answers the shell's.
//
// Per ExecutiveOverviewQueryDto's own comment, only `pillar` and
// `institution` actually narrow anything downstream today - priority,
// geographicScope, distributionCompany and technology are accepted for
// contract parity and are no-ops everywhere. The frontend's own
// GlobalFilterBar renders controls for only 4 of the 7 (period, pillar,
// institution, technology) for the same reason - see its own comment.
// The other 3 are still returned here (the schema requires them) but as
// fixed, honestly-scoped option lists rather than a query, since nothing
// stored anywhere backs them yet.
@Injectable()
export class FiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [pillars, projectOwners, bottleneckInstitutions, periods] = await Promise.all([
      this.prisma.pillar.findMany({ orderBy: { name: "asc" } }),
      this.prisma.project.findMany({ select: { owner: true }, distinct: ["owner"] }),
      this.prisma.bottleneck.findMany({ select: { institution: true }, distinct: ["institution"] }),
      this.prisma.kpiValue.findMany({ select: { period: true }, distinct: ["period"] }),
    ]);

    const withAll = (label: string, options: { value: string; label: string }[]) => [
      { value: "all", label: `All ${label}` },
      ...options,
    ];

    const institutionNames = [
      ...new Set([...projectOwners.map((p) => p.owner), ...bottleneckInstitutions.map((b) => b.institution)]),
    ].sort((a, b) => a.localeCompare(b));

    return {
      reportingPeriods: [...sortPeriodsDescending(periods.map((p) => p.period)).map((period) => ({
        value: period,
        label: formatPeriodLabel(period),
      })), { value: "custom", label: "Custom range…" }],
      pillars: withAll(
        "pillars",
        pillars.map((p) => ({ value: p.slug, label: p.name })),
      ),
      institutions: withAll(
        "institutions",
        institutionNames.map((name) => ({ value: name, label: name })),
      ),
      // Not yet backed by any stored field - see this file's header comment.
      priorities: [
        { value: "priority", label: "Priority actions" },
        { value: "all", label: "Complete portfolio" },
      ],
      geographicScopes: [
        { value: "national", label: "National" },
        { value: "state", label: "By state" },
        { value: "disco", label: "By Distribution Company" },
      ],
      distributionCompanies: withAll("Distribution Companies", []),
      technologies: withAll("technologies", []),
    };
  }
}

/** Sorts a mix of plain-year ("2026") and quarter-tagged ("q3-2025")
 * periods newest-first, by (year, quarter) - a plain lexicographic sort
 * would put "2026" before "q3-2025" despite 2026 being later. A plain year
 * with no quarter sorts after that year's own quarters (treated as Q5), so
 * an annual figure for a year reads as the most recent thing known about
 * that year. */
function sortPeriodsDescending(periods: string[]): string[] {
  const keyFor = (period: string): [number, number] => {
    const quarter = /^q([1-4])-(\d{4})$/i.exec(period.trim());
    if (quarter) return [Number(quarter[2]), Number(quarter[1])];
    const year = /^(\d{4})$/.exec(period.trim());
    if (year) return [Number(year[1]), 5];
    return [0, 0];
  };
  return [...periods].sort((a, b) => {
    const [yearA, quarterA] = keyFor(a);
    const [yearB, quarterB] = keyFor(b);
    return yearB - yearA || quarterB - quarterA;
  });
}
