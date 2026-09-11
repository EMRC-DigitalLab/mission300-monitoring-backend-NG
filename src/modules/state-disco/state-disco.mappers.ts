import type { DiscoPerformanceRecord, Institution } from "@prisma/client";

/**
 * State/DisCo is NOT a read-composition layer like Executive Overview or
 * Pillar Dashboards - DisCo financial/operational performance is real data
 * that comes from external NERC regulatory records nothing else in this
 * schema tracks, admin-entered for now (see DiscoPerformanceRecord's own
 * schema comment). A "DisCo" is an existing Institution row (type
 * "Disco"), not a separate entity.
 */

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

const numberFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatInt(value: number): string {
  return numberFormatter.format(Math.round(value));
}

export function formatMwh(value: number): string {
  return `${numberFormatter.format(Math.round(value))} MWh`;
}

export function formatNgnBillions(value: number): string {
  return `NGN ${decimalFormatter.format(value / 1_000_000_000)}bn`;
}

export function formatPercent(value: number): string {
  return `${decimalFormatter.format(value)}%`;
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function toValidationLabel(status: string): string {
  return titleCase(status.toLowerCase().replace(/_/g, "-"));
}

export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

type RecordWithInstitution = DiscoPerformanceRecord & { institution: Institution };

/**
 * Matches discoComparisonRowSchema exactly, minus the two bar-percent pairs
 * (energyReceivedBarPercent/energyBilledBarPercent and
 * revenueBilledBarPercent/revenueCollectedBarPercent) and `rankLabel` -
 * both need every row in the comparison to compute a relative scale/rank,
 * so the service adds those after mapping the whole batch.
 */
export function toDiscoComparisonRowBase(record: RecordWithInstitution) {
  const meteringRate = ratio(record.meteredCustomers, record.activeCustomers);
  const billingEfficiency = ratio(toNumber(record.energyBilledMwh), toNumber(record.energyReceivedMwh));
  const collectionEfficiency = ratio(toNumber(record.revenueCollectedNgn), toNumber(record.revenueBilledNgn));
  const remittancePerformance = ratio(
    toNumber(record.remittanceActualNgn),
    toNumber(record.remittanceObligationNgn),
  );

  return {
    id: record.institutionId,
    name: record.institution.name,
    activeCustomers: formatInt(record.activeCustomers),
    meteredCustomers: formatInt(record.meteredCustomers),
    unmeteredCustomers: formatInt(record.activeCustomers - record.meteredCustomers),
    meteringRate: formatPercent(meteringRate),
    meteringRateValue: meteringRate,
    energyReceived: formatMwh(toNumber(record.energyReceivedMwh)),
    energyReceivedValue: toNumber(record.energyReceivedMwh),
    energyBilled: formatMwh(toNumber(record.energyBilledMwh)),
    energyBilledValue: toNumber(record.energyBilledMwh),
    billingEfficiency: formatPercent(billingEfficiency),
    revenueBilled: formatNgnBillions(toNumber(record.revenueBilledNgn)),
    revenueBilledValue: toNumber(record.revenueBilledNgn),
    revenueCollected: formatNgnBillions(toNumber(record.revenueCollectedNgn)),
    revenueCollectedValue: toNumber(record.revenueCollectedNgn),
    collectionEfficiency: formatPercent(collectionEfficiency),
    remittancePerformance: formatPercent(remittancePerformance),
    validationLabel: toValidationLabel(record.validationStatus),
  };
}
