import type {
  KpiDefinition,
  KpiTargetPoint,
  KpiValue,
  Pillar,
  Submission,
  SubmissionItem,
} from "@prisma/client";
import { toKebabCase } from "@/common/utils/enum-casing";
import { ADMIN_OVERRIDE_SOURCE_REFERENCE } from "@/modules/kpi-explorer/admin-override.constant";

type ValueWithProvenance = KpiValue & { sourceSubmissionItem: SubmissionItem & { submission: Submission } };

/**
 * The real contract's 5-value validationStatus vocabulary is broader than
 * what this system can currently produce: only two decisions ever write a
 * KpiValue (APPROVE, PROVISIONALLY_APPROVE - see recordDecision() in
 * data-submissions.service.ts), so "public-source" and "requires-
 * validation" (which imply a value sourced some OTHER way, e.g. a public
 * report typed in directly) are never reachable yet. Honest 3-state
 * derivation rather than inventing a path to values this system can't
 * actually produce.
 */
function deriveValidationStatus(submissionStatus: string | null): string {
  if (!submissionStatus) return "future";
  if (submissionStatus === "APPROVED") return "confirmed";
  if (submissionStatus === "PROVISIONALLY_APPROVED") return "provisional";
  return "requires-validation";
}

function deriveConfidence(submissionStatus: string | null): string {
  if (!submissionStatus) return "future-gap";
  if (submissionStatus === "APPROVED") return "confirmed";
  return "requires-validation";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

export function formatPeriodLabel(period: string): string {
  const quarter = /^q([1-4])-(\d{4})$/i.exec(period.trim());
  if (quarter) return `Q${quarter[1]} ${quarter[2]}`;
  return period;
}

const HISTORY_WINDOW = 4;

function buildTrend(
  currentValue: number,
  previousValue: number,
  previousPeriod: string,
  unit: string,
  direction: "higher-is-better" | "lower-is-better",
) {
  const change = Math.round((currentValue - previousValue) * 100) / 100;
  const sign = change > 0 ? "+" : "";
  const suffix = unit === "%" ? " pp" : unit ? ` ${unit}` : "";
  return {
    change,
    label: `${sign}${change}${suffix} vs ${formatPeriodLabel(previousPeriod)}`,
    direction,
  };
}

type KpiWithPillar = KpiDefinition & { pillar: Pillar };

/** Matches kpiCatalogueRowSchema exactly (m300-frontend/src/api/schemas/kpi-explorer.ts). */
export function toCatalogueRow(kpi: KpiWithPillar, latestValue: ValueWithProvenance | null) {
  const submissionStatus = latestValue?.sourceSubmissionItem.submission.status ?? null;
  return {
    id: kpi.code,
    name: kpi.name,
    pillar: kpi.pillar.slug,
    category: kpi.category || "Uncategorized",
    unit: kpi.unit,
    sourceInstitution: kpi.sourceInstitution || "Not supplied",
    sourceDataset: kpi.sourceDataset || "Not supplied",
    frequency: kpi.frequency || "Not supplied",
    readiness: toKebabCase(kpi.readiness),
    validationStatus: deriveValidationStatus(submissionStatus),
    lastUpdated: (latestValue?.approvedAt ?? kpi.updatedAt).toISOString(),
    active: kpi.isActive,
  };
}

function buildVarianceLabel(
  current: number | null,
  target: number | null,
  direction: string,
  unit: string,
): string {
  if (current === null || target === null) return "No variance available.";
  const diff = current - target;
  const onTrack = direction === "HIGHER_IS_BETTER" ? diff >= 0 : diff <= 0;
  const sign = diff > 0 ? "+" : "";
  const unitSuffix = unit ? ` ${unit}` : "";
  return `${sign}${diff.toFixed(2)}${unitSuffix} vs target (${onTrack ? "on track" : "behind target"})`;
}

const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  PROVISIONALLY_APPROVED: "Provisionally approved",
};

type KpiWithFullProfile = KpiWithPillar & { targetPoints: KpiTargetPoint[] };

/**
 * Matches kpiProfileSchema exactly. `current`/`history`/`validationStatus`/
 * `confidence`/`reportingPeriod`/`validationDecision` are all derived from
 * `kpiValues` (ordered oldest to newest) here, never stored - the same
 * "only changes via an approved submission" rule the schema's own header
 * comment already states. `linkedRecords` is always [] for now - the
 * Implementation Register (Programs/Projects) hasn't been rebuilt to a
 * real contract yet, so there's nothing real to join against.
 */
export function toKpiProfile(kpi: KpiWithFullProfile, kpiValues: ValueWithProvenance[]) {
  const sorted = [...kpiValues].sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());
  const latest = sorted.at(-1) ?? null;
  const submissionStatus = latest?.sourceSubmissionItem.submission.status ?? null;
  const current = toNumber(latest?.value);
  const target = toNumber(kpi.target);
  const baseline = toNumber(kpi.baseline);

  const history = sorted.slice(-HISTORY_WINDOW).map((v) => ({
    id: v.id,
    period: formatPeriodLabel(v.period),
    value: toNumber(v.value) ?? 0,
    validationStatus: deriveValidationStatus(v.sourceSubmissionItem.submission.status),
    submissionId: v.sourceSubmissionItem.submissionId,
    // Only ever true for a value set via the setCurrentValue() admin
    // override - identified by its exact sourceReference stamp, not a null
    // obligationId, since the historical bulk-import scripts also leave
    // obligationId null on their own synthetic submissions (see
    // ADMIN_OVERRIDE_SOURCE_REFERENCE's comment in kpi-explorer.service.ts).
    editable: v.sourceSubmissionItem.submission.sourceReference === ADMIN_OVERRIDE_SOURCE_REFERENCE,
  }));

  const direction = toKebabCase(kpi.direction) as "higher-is-better" | "lower-is-better";
  const previous = sorted.length > 1 ? sorted.at(-2)! : null;
  const previousValue = previous ? toNumber(previous.value) : null;
  const trend =
    current !== null && previous !== null && previousValue !== null
      ? buildTrend(current, previousValue, previous.period, kpi.unit, direction)
      : undefined;

  const definitionText = kpi.definition || "Not yet documented.";
  const lastUpdated = (latest?.approvedAt ?? kpi.updatedAt).toISOString();

  return {
    id: kpi.code,
    name: kpi.name,
    pillar: kpi.pillar.slug,

    definition: definitionText,
    formula: kpi.formula || "Not yet documented.",
    unit: kpi.unit,
    aggregation: kpi.aggregation,
    frequency: kpi.frequency,
    disaggregation: kpi.disaggregation,
    limitations: kpi.limitations,

    baseline,
    baselineLabel: kpi.baselineLabel,
    current,
    currentLabel: current === null ? "No data yet" : `${current}${kpi.unit ? ` ${kpi.unit}` : ""}`,
    target,
    targetLabel: kpi.targetLabel,
    targetBasis: kpi.targetBasis
      ? (toKebabCase(kpi.targetBasis) as "level" | "growth-rate" | "none")
      : undefined,
    targetBasisLabel: kpi.targetBasisLabel ?? undefined,
    targetDate: kpi.targetDate,
    targets: kpi.targetPoints.map((p) => ({ period: p.period, value: Number(p.value), label: p.label })),
    externalStandardAlignment: (kpi.externalStandardAlignment as object | null) ?? null,
    varianceLabel: buildVarianceLabel(current, target, kpi.direction, kpi.unit),
    direction,
    trend,
    history,

    sourceInstitution: kpi.sourceInstitution || "Not supplied",
    sourceDataset: kpi.sourceDataset || "Not supplied",
    sourceReference: kpi.sourceReference,
    reportingPeriod: latest ? formatPeriodLabel(latest.period) : "",
    validationStatus: deriveValidationStatus(submissionStatus),
    validationDecision: submissionStatus ? (DECISION_LABEL[submissionStatus] ?? "") : "",
    version: kpi.version,
    confidence: deriveConfidence(submissionStatus),
    provenance: {
      definition: definitionText,
      methodology: kpi.formula || "Not yet documented.",
      source: kpi.sourceInstitution || "Not supplied",
      lastUpdated,
    },

    linkedRecords: [] as unknown[],
  };
}
