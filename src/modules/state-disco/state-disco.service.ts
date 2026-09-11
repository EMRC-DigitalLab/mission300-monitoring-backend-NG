import { Injectable, NotFoundException } from "@nestjs/common";
import { ValidationStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { toKebabCase } from "@/common/utils/enum-casing";
import {
  formatPercent,
  ratio,
  toDiscoComparisonRowBase,
  toValidationLabel,
} from "@/modules/state-disco/state-disco.mappers";
import type { StateDiscoQueryDto } from "@/modules/state-disco/dto/state-disco-query.dto";
import type { UpsertDiscoPerformanceDto } from "@/modules/state-disco/dto/upsert-disco-performance.dto";

const PROVENANCE_NOW = () => new Date().toISOString();

@Injectable()
export class StateDiscoService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [discos, states, periodRows] = await Promise.all([
      this.prisma.institution.findMany({ where: { type: "Disco" }, orderBy: { name: "asc" } }),
      this.prisma.state.findMany({ orderBy: { name: "asc" } }),
      this.prisma.discoPerformanceRecord.findMany({ select: { period: true }, distinct: ["period"] }),
    ]);

    const withAll = (label: string, options: { value: string; label: string }[]) => [
      { value: "all", label: `All ${label}` },
      ...options,
    ];

    return {
      reportingPeriods: withAll(
        "periods",
        [...new Set(periodRows.map((p) => p.period))].sort().map((p) => ({ value: p, label: p })),
      ),
      // Not measured data - the page's own View toggle between the DisCo-
      // led default and the State view (docs/specs/state-disco-
      // performance.md Section A/D).
      views: [
        { value: "disco", label: "Distribution Company" },
        { value: "state", label: "State" },
      ],
      // "national" is this one endpoint's own all-DisCos sentinel - NOT
      // "all", confirmed directly against stateDiscoQuerySchema and the
      // real mock handler's filterUtility().
      distributionCompanies: [
        { value: "national", label: "National (all DisCos)" },
        ...discos.map((d) => ({ value: d.id, label: d.name })),
      ],
      states: withAll(
        "states",
        states.map((s) => ({ value: s.id, label: s.name })),
      ),
      utilityMetrics: withAll("utility metrics", [
        { value: "metering-rate", label: "Metering rate" },
        { value: "atcc-losses", label: "ATC&C loss rate" },
        { value: "collection-efficiency", label: "Collection efficiency" },
        { value: "market-remittance", label: "Market-remittance performance" },
      ]),
      serviceBands: withAll(
        "bands",
        (["A", "B", "C", "D", "E"] as const).map((b) => ({ value: b, label: `Band ${b}` })),
      ),
      validationStatuses: withAll(
        "validation statuses",
        Object.values(ValidationStatus).map((s) => ({ value: toKebabCase(s), label: toValidationLabel(s) })),
      ),
      // Not measured data - a fixed, small set of the regulatory sources
      // this module's own spec names (docs/specs/state-disco-
      // performance.md's "Data source" column throughout).
      sources: withAll("sources", [
        { value: "nerc", label: "Nigerian Electricity Regulatory Commission" },
        { value: "rea", label: "Rural Electrification Agency" },
      ]),
    };
  }

  private buildMeta(
    title: string,
    description: string,
    sourceLabel = "Nigerian Electricity Regulatory Commission",
  ) {
    return {
      title,
      description,
      lastUpdatedLabel: "Just now",
      sourceLabel,
    };
  }

  private async getLatestRecordPerDisco() {
    const records = await this.prisma.discoPerformanceRecord.findMany({
      include: { institution: true },
      orderBy: { createdAt: "desc" },
    });
    const latest = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      if (!latest.has(record.institutionId)) latest.set(record.institutionId, record);
    }
    return [...latest.values()];
  }

  private async getRecordsForDisco(institutionId: string) {
    return this.prisma.discoPerformanceRecord.findMany({
      where: { institutionId },
      include: { institution: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOverview(query: StateDiscoQueryDto) {
    const selection = query.distributionCompany ?? "national";
    const now = PROVENANCE_NOW();

    let selectedLabel: string;
    let current: {
      activeCustomers: number;
      meteredCustomers: number;
      energyReceivedMwh: number;
      energyBilledMwh: number;
      revenueBilledNgn: number;
      revenueCollectedNgn: number;
      remittanceObligationNgn: number;
      remittanceActualNgn: number;
      atccLossRatePercent: number;
      allowedLossRatePercent: number;
    };
    let previous: typeof current | null = null;

    if (selection === "national") {
      const latestPerDisco = await this.getLatestRecordPerDisco();
      selectedLabel = "National (all DisCos)";
      current = latestPerDisco.reduce(
        (acc, r) => ({
          activeCustomers: acc.activeCustomers + r.activeCustomers,
          meteredCustomers: acc.meteredCustomers + r.meteredCustomers,
          energyReceivedMwh: acc.energyReceivedMwh + Number(r.energyReceivedMwh),
          energyBilledMwh: acc.energyBilledMwh + Number(r.energyBilledMwh),
          revenueBilledNgn: acc.revenueBilledNgn + Number(r.revenueBilledNgn),
          revenueCollectedNgn: acc.revenueCollectedNgn + Number(r.revenueCollectedNgn),
          remittanceObligationNgn: acc.remittanceObligationNgn + Number(r.remittanceObligationNgn),
          remittanceActualNgn: acc.remittanceActualNgn + Number(r.remittanceActualNgn),
          atccLossRatePercent: acc.atccLossRatePercent + Number(r.atccLossRatePercent),
          allowedLossRatePercent: acc.allowedLossRatePercent + Number(r.allowedLossRatePercent),
        }),
        {
          activeCustomers: 0,
          meteredCustomers: 0,
          energyReceivedMwh: 0,
          energyBilledMwh: 0,
          revenueBilledNgn: 0,
          revenueCollectedNgn: 0,
          remittanceObligationNgn: 0,
          remittanceActualNgn: 0,
          atccLossRatePercent: 0,
          allowedLossRatePercent: 0,
        },
      );
      if (latestPerDisco.length > 0) {
        current.atccLossRatePercent /= latestPerDisco.length;
        current.allowedLossRatePercent /= latestPerDisco.length;
      }
      // No real period-aligned multi-institution history is tracked yet to
      // diff a national aggregate against a prior cycle - honest zero
      // rather than an invented comparison.
      previous = null;
    } else {
      const institution = await this.prisma.institution.findUnique({ where: { id: selection } });
      if (!institution) throw new NotFoundException("Unknown Distribution Company.");
      selectedLabel = institution.name;

      const records = await this.getRecordsForDisco(selection);
      if (records.length === 0) {
        current = {
          activeCustomers: 0,
          meteredCustomers: 0,
          energyReceivedMwh: 0,
          energyBilledMwh: 0,
          revenueBilledNgn: 0,
          revenueCollectedNgn: 0,
          remittanceObligationNgn: 0,
          remittanceActualNgn: 0,
          atccLossRatePercent: 0,
          allowedLossRatePercent: 0,
        };
      } else {
        const r = records[0];
        current = {
          activeCustomers: r.activeCustomers,
          meteredCustomers: r.meteredCustomers,
          energyReceivedMwh: Number(r.energyReceivedMwh),
          energyBilledMwh: Number(r.energyBilledMwh),
          revenueBilledNgn: Number(r.revenueBilledNgn),
          revenueCollectedNgn: Number(r.revenueCollectedNgn),
          remittanceObligationNgn: Number(r.remittanceObligationNgn),
          remittanceActualNgn: Number(r.remittanceActualNgn),
          atccLossRatePercent: Number(r.atccLossRatePercent),
          allowedLossRatePercent: Number(r.allowedLossRatePercent),
        };
        if (records.length > 1) {
          const p = records[1];
          previous = {
            activeCustomers: p.activeCustomers,
            meteredCustomers: p.meteredCustomers,
            energyReceivedMwh: Number(p.energyReceivedMwh),
            energyBilledMwh: Number(p.energyBilledMwh),
            revenueBilledNgn: Number(p.revenueBilledNgn),
            revenueCollectedNgn: Number(p.revenueCollectedNgn),
            remittanceObligationNgn: Number(p.remittanceObligationNgn),
            remittanceActualNgn: Number(p.remittanceActualNgn),
            atccLossRatePercent: Number(p.atccLossRatePercent),
            allowedLossRatePercent: Number(p.allowedLossRatePercent),
          };
        }
      }
    }

    const meteringRate = ratio(current.meteredCustomers, current.activeCustomers);
    const collectionEfficiency = ratio(current.revenueCollectedNgn, current.revenueBilledNgn);
    const remittancePerformance = ratio(current.remittanceActualNgn, current.remittanceObligationNgn);

    const noPriorTrend = (direction: "higher-is-better" | "lower-is-better") => ({
      change: 0,
      label: "No prior period recorded yet",
      direction,
    });

    const trendFor = (
      currentValue: number,
      previousValue: number | undefined,
      direction: "higher-is-better" | "lower-is-better",
    ) => {
      if (previousValue === undefined) return noPriorTrend(direction);
      const change = Math.round((currentValue - previousValue) * 10) / 10;
      return { change, label: `${change >= 0 ? "+" : ""}${change} pts vs prior period`, direction };
    };

    const provenance = (definition: string, methodology: string, source: string) => ({
      definition,
      methodology,
      source,
      lastUpdated: now,
    });

    const metrics = [
      {
        id: "metering-rate",
        title: "Metering rate",
        value: formatPercent(meteringRate),
        supportingLabel: `${current.meteredCustomers.toLocaleString()} of ${current.activeCustomers.toLocaleString()} active customers metered`,
        benchmarkLabel: "100% by 2027",
        varianceLabel: `${(meteringRate - 100).toFixed(1)} pts vs 100% target`,
        progressPercent: Math.max(0, Math.min(100, Math.round(meteringRate))),
        trend: trendFor(
          meteringRate,
          previous ? ratio(previous.meteredCustomers, previous.activeCustomers) : undefined,
          "higher-is-better",
        ),
        provenance: provenance(
          "Metered active customers as a share of active registered customers.",
          "Metered customers divided by active customers for the same Distribution Company and period, multiplied by 100.",
          "Nigerian Electricity Regulatory Commission Monthly Metering Factsheet.",
        ),
      },
      {
        id: "atcc-losses",
        title: "Aggregate Technical, Commercial and Collection loss rate",
        value: formatPercent(current.atccLossRatePercent),
        supportingLabel: `Allowed benchmark ${formatPercent(current.allowedLossRatePercent)}`,
        benchmarkLabel: `Allowed: ${formatPercent(current.allowedLossRatePercent)}`,
        varianceLabel: `${(current.atccLossRatePercent - current.allowedLossRatePercent).toFixed(1)} pts vs allowed loss`,
        progressPercent: Math.max(0, Math.min(100, Math.round(100 - current.atccLossRatePercent))),
        trend: trendFor(current.atccLossRatePercent, previous?.atccLossRatePercent, "lower-is-better"),
        provenance: provenance(
          "Official utility loss rate.",
          "Use the reported Distribution Company value; show variance from allowed loss in percentage points.",
          "Nigerian Electricity Regulatory Commission Quarterly Reports and tariff orders.",
        ),
      },
      {
        id: "collection-efficiency",
        title: "Collection efficiency",
        value: formatPercent(collectionEfficiency),
        supportingLabel: `${current.revenueCollectedNgn.toLocaleString()} of ${current.revenueBilledNgn.toLocaleString()} NGN billed collected`,
        benchmarkLabel: "100%",
        varianceLabel: `${(collectionEfficiency - 100).toFixed(1)} pts vs 100% target`,
        progressPercent: Math.max(0, Math.min(100, Math.round(collectionEfficiency))),
        trend: trendFor(
          collectionEfficiency,
          previous ? ratio(previous.revenueCollectedNgn, previous.revenueBilledNgn) : undefined,
          "higher-is-better",
        ),
        provenance: provenance(
          "Share of billed customer revenue actually collected.",
          "Revenue collected divided by revenue billed, multiplied by 100.",
          "Nigerian Electricity Regulatory Commission Quarterly Reports.",
        ),
      },
      {
        id: "market-remittance",
        title: "Market-remittance performance",
        value: formatPercent(remittancePerformance),
        supportingLabel: `${current.remittanceActualNgn.toLocaleString()} of ${current.remittanceObligationNgn.toLocaleString()} NGN obligation remitted`,
        benchmarkLabel: "100% of applicable obligation",
        varianceLabel: `${(remittancePerformance - 100).toFixed(1)} pts vs 100% compliance`,
        progressPercent: Math.max(0, Math.min(100, Math.round(remittancePerformance))),
        trend: trendFor(
          remittancePerformance,
          previous ? ratio(previous.remittanceActualNgn, previous.remittanceObligationNgn) : undefined,
          "higher-is-better",
        ),
        provenance: provenance(
          "Actual market remittance as a share of applicable obligation.",
          "Actual remittance divided by the applicable Nigerian Bulk Electricity Trading Plc or Market Operator obligation, multiplied by 100.",
          "Nigerian Electricity Regulatory Commission market-remittance tables.",
        ),
      },
    ];

    return {
      meta: this.buildMeta(
        "Distribution Company performance",
        "Metering, loss, collection and remittance performance for the selected Distribution Company.",
      ),
      selectedUtility: selectedLabel,
      metrics,
    };
  }

  async getComparison(query: StateDiscoQueryDto) {
    const selection = query.distributionCompany ?? "national";
    const latestPerDisco = await this.getLatestRecordPerDisco();
    const scoped =
      selection === "national" ? latestPerDisco : latestPerDisco.filter((r) => r.institutionId === selection);

    const validationFilter = query.validationStatus ?? "all";
    const filtered =
      validationFilter === "all"
        ? scoped
        : scoped.filter((r) => toKebabCase(r.validationStatus) === validationFilter);

    const baseRows = filtered.map((r) => toDiscoComparisonRowBase(r));

    const maxEnergyReceived = Math.max(1, ...baseRows.map((r) => r.energyReceivedValue));
    const maxEnergyBilled = Math.max(1, ...baseRows.map((r) => r.energyBilledValue));
    const maxRevenueBilled = Math.max(1, ...baseRows.map((r) => r.revenueBilledValue));
    const maxRevenueCollected = Math.max(1, ...baseRows.map((r) => r.revenueCollectedValue));

    const ranked = [...baseRows].sort((a, b) => b.meteringRateValue - a.meteringRateValue);
    const rankById = new Map(ranked.map((r, index) => [r.id, index + 1]));

    const rows = baseRows.map((r) => ({
      id: r.id,
      name: r.name,
      rankLabel: `${rankById.get(r.id)} of ${baseRows.length}`,
      activeCustomers: r.activeCustomers,
      meteredCustomers: r.meteredCustomers,
      unmeteredCustomers: r.unmeteredCustomers,
      meteringRate: r.meteringRate,
      energyReceived: r.energyReceived,
      energyBilled: r.energyBilled,
      billingEfficiency: r.billingEfficiency,
      energyReceivedBarPercent: Math.round((r.energyReceivedValue / maxEnergyReceived) * 1000) / 10,
      energyBilledBarPercent: Math.round((r.energyBilledValue / maxEnergyBilled) * 1000) / 10,
      revenueBilled: r.revenueBilled,
      revenueCollected: r.revenueCollected,
      collectionEfficiency: r.collectionEfficiency,
      revenueBilledBarPercent: Math.round((r.revenueBilledValue / maxRevenueBilled) * 1000) / 10,
      revenueCollectedBarPercent: Math.round((r.revenueCollectedValue / maxRevenueCollected) * 1000) / 10,
      remittancePerformance: r.remittancePerformance,
      validationLabel: r.validationLabel,
    }));

    return {
      meta: this.buildMeta(
        "Distribution Company comparison",
        "Customer, energy, revenue and remittance position ranked across Distribution Companies.",
      ),
      rows,
    };
  }

  async upsertPerformance(institutionId: string, dto: UpsertDiscoPerformanceDto) {
    const institution = await this.prisma.institution.findUnique({ where: { id: institutionId } });
    if (!institution) throw new NotFoundException("Institution not found.");
    if (institution.type !== "Disco") {
      throw new NotFoundException("This institution is not registered as a Distribution Company.");
    }

    const record = await this.prisma.discoPerformanceRecord.upsert({
      where: { institutionId_period: { institutionId, period: dto.period } },
      create: {
        institutionId,
        period: dto.period,
        activeCustomers: dto.activeCustomers,
        meteredCustomers: dto.meteredCustomers,
        energyReceivedMwh: dto.energyReceivedMwh,
        energyBilledMwh: dto.energyBilledMwh,
        revenueBilledNgn: dto.revenueBilledNgn,
        revenueCollectedNgn: dto.revenueCollectedNgn,
        remittanceObligationNgn: dto.remittanceObligationNgn,
        remittanceActualNgn: dto.remittanceActualNgn,
        allowedLossRatePercent: dto.allowedLossRatePercent,
        atccLossRatePercent: dto.atccLossRatePercent,
        validationStatus: dto.validationStatus ?? "PROVISIONAL",
      },
      update: {
        activeCustomers: dto.activeCustomers,
        meteredCustomers: dto.meteredCustomers,
        energyReceivedMwh: dto.energyReceivedMwh,
        energyBilledMwh: dto.energyBilledMwh,
        revenueBilledNgn: dto.revenueBilledNgn,
        revenueCollectedNgn: dto.revenueCollectedNgn,
        remittanceObligationNgn: dto.remittanceObligationNgn,
        remittanceActualNgn: dto.remittanceActualNgn,
        allowedLossRatePercent: dto.allowedLossRatePercent,
        atccLossRatePercent: dto.atccLossRatePercent,
        ...(dto.validationStatus ? { validationStatus: dto.validationStatus } : {}),
      },
      include: { institution: true },
    });

    return {
      record: toDiscoComparisonRowBase(record),
      message: `${record.institution.name}'s ${dto.period} performance record has been saved.`,
    };
  }
}
